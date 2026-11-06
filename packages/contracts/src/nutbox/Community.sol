// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "nutbox/interfaces/ICalculator.sol";
import "nutbox/interfaces/ICommunity.sol";
import "nutbox/interfaces/IPool.sol";
import "nutbox/interfaces/IPoolFactory.sol";
import "nutbox/interfaces/ICommittee.sol";
import "nutbox/ERC20Helper.sol";

contract Community is ICommunity, ERC20Helper, Initializable, Ownable, ReentrancyGuard {
  uint16 constant CONSTANTS_10000 = 10000;
  uint256 public constant MAX_ACTIVE_POOLS = 255;

  address public committee;
  uint16 public feeRatio;
  address private devFund;
  uint256 private retainedRevenue;
  mapping(address => bool) private openedPools;
  mapping(address => uint256) private poolAcc;
  mapping(address => mapping(address => uint256)) private userRewards;
  mapping(address => mapping(address => uint256)) private userDebts;
  mapping(address => bool) private whitelists;
  mapping(address => uint16) private poolRatios;
  address[] public activedPools;
  address[] public createdPools;
  uint256 private lastRewardCursor;
  address public communityToken;
  bool public isMintableCommunityToken;
  address public rewardCalculator;
  uint256 private totalUserPendingRewards;

  event AdminSetFeeRatio(uint16 ratio);
  event AdminClosePool(address indexed pool);
  event AdminSetPoolRatio(address[] pools, uint16[] ratios);
  event WithdrawRewards(address[] pool, address indexed who, uint256 amount);
  event PoolUpdated(address indexed who, uint256 amount);
  event DevChanged(address indexed oldDev, address indexed newDev);
  event RevenueWithdrawn(address indexed devFund, uint256 amount);

  modifier onlyPool() {
    require(whitelists[msg.sender], "PNIW");
    _;
  }

  constructor() Ownable(msg.sender) {
    _disableInitializers();
  }

  function initialize(
    address _admin,
    address _committee,
    address _communityToken,
    address _rewardCalculator,
    bool _isMintableCommunityToken
  ) external initializer {
    require(_admin != address(0), "Invalid admin");
    require(_committee != address(0), "Invalid committee");
    require(_communityToken != address(0), "Invalid token");
    require(_rewardCalculator != address(0), "Invalid calculator");
    _transferOwnership(_admin);
    devFund = _admin;
    committee = _committee;
    communityToken = _communityToken;
    rewardCalculator = _rewardCalculator;
    isMintableCommunityToken = _isMintableCommunityToken;
    emit DevChanged(address(0), _admin);
  }

  function _chargeTier2Fee() private {
    uint256 fee = ICommittee(committee).getCommunitySettingsFee();
    if (fee == 0) return;
    require(msg.value >= fee, "Insufficient fee");
    address payable recipient = ICommittee(committee).getFeeRecipient();
    (bool ok, ) = recipient.call{ value: fee }("");
    require(ok, "Fee transfer failed");
    if (msg.value > fee) {
      (bool ok2, ) = msg.sender.call{ value: msg.value - fee }("");
      require(ok2, "Refund failed");
    }
  }

  function _chargeTier3Fee() private {
    uint256 fee = ICommittee(committee).getPoolOperationFee();
    if (fee == 0) return;
    require(msg.value >= fee, "Insufficient fee");
    address payable recipient = ICommittee(committee).getFeeRecipient();
    (bool ok, ) = recipient.call{ value: fee }("");
    require(ok, "Fee transfer failed");
    if (msg.value > fee) {
      (bool ok2, ) = msg.sender.call{ value: msg.value - fee }("");
      require(ok2, "Refund failed");
    }
  }

  function adminSetDev(address _dev) external onlyOwner {
    require(_dev != address(0), "IA");
    emit DevChanged(devFund, _dev);
    devFund = _dev;
  }

  function adminWithdrawRevenue() public nonReentrant {
    require(retainedRevenue > 0);
    uint256 harvestAmount = retainedRevenue;
    if (!isMintableCommunityToken) {
      uint256 balance = IERC20(communityToken).balanceOf(address(this));
      harvestAmount = balance < retainedRevenue ? balance : retainedRevenue;
    }
    retainedRevenue = retainedRevenue - harvestAmount;
    _unlockOrMintAsset(devFund, harvestAmount);
    emit RevenueWithdrawn(devFund, harvestAmount);
  }

  function adminSetFeeRatio(uint16 _ratio) external payable onlyOwner {
    require(_ratio <= CONSTANTS_10000, "PR>1w");
    _chargeTier2Fee();
    _updatePoolsInternal();
    feeRatio = _ratio;
    emit AdminSetFeeRatio(_ratio);
  }

  function adminAddPool(
    string memory poolName,
    uint16[] memory ratios,
    address poolFactory,
    bytes calldata meta
  ) external payable onlyOwner {
    require(activedPools.length < MAX_ACTIVE_POOLS, "MPR");
    require((activedPools.length + 1) == ratios.length, "WPC");
    require(ICommittee(committee).verifyContract(poolFactory), "UPF");
    _checkRatioSum(ratios);
    _chargeTier2Fee();

    address pool = IPoolFactory(poolFactory).createPool(address(this), poolName, meta);
    _updatePoolsInternal();
    openedPools[pool] = true;
    whitelists[pool] = true;
    poolAcc[pool] = 0;
    activedPools.push(pool);
    createdPools.push(pool);
    _updatePoolRatios(ratios);
  }

  function adminClosePool(uint256 poolIndex, uint16[] memory ratios) external payable onlyOwner {
    require(poolIndex < activedPools.length, "OOB");
    address poolAddress = activedPools[poolIndex];
    require(openedPools[poolAddress], "PIA");
    require(ratios.length == activedPools.length - 1, "WRL");
    _checkRatioSum(ratios);
    _chargeTier2Fee();
    _updatePoolsInternal();

    openedPools[poolAddress] = false;
    for (uint256 i = poolIndex; i < activedPools.length - 1; i++) {
      activedPools[i] = activedPools[i + 1];
    }
    activedPools.pop();
    _updatePoolRatios(ratios);
    emit AdminClosePool(poolAddress);
  }

  function adminSetPoolRatios(uint16[] memory ratios) external payable onlyOwner {
    require(activedPools.length == ratios.length, "WL");
    _checkRatioSum(ratios);
    _chargeTier2Fee();
    _updatePoolsInternal();
    _updatePoolRatios(ratios);
  }

  function withdrawPoolsRewards(address[] memory poolAddresses) external payable nonReentrant {
    if (lastRewardCursor == 0) return;
    require(poolAddresses.length > 0, "MHO1");
    _chargeTier3Fee();

    if (ICalculator(rewardCalculator).rewardHead() > lastRewardCursor) {
      _updatePoolsInternal();
    }

    uint256 totalAvailableRewards = 0;
    for (uint256 i = 0; i < poolAddresses.length; i++) {
      address poolAddress = poolAddresses[i];
      require(whitelists[poolAddress], "IP");
      uint256 stakedAmount = IPool(poolAddress).getUserStakedAmount(msg.sender);

      uint256 pending = (stakedAmount * poolAcc[poolAddress]) / 1e12 - userDebts[poolAddress][msg.sender];
      if (pending > 0) {
        userRewards[poolAddress][msg.sender] = userRewards[poolAddress][msg.sender] + pending;
      }
      totalAvailableRewards = totalAvailableRewards + userRewards[poolAddress][msg.sender];
      userDebts[poolAddress][msg.sender] = (stakedAmount * poolAcc[poolAddress]) / 1e12;
      userRewards[poolAddress][msg.sender] = 0;
    }

    if (totalUserPendingRewards >= totalAvailableRewards) {
      totalUserPendingRewards -= totalAvailableRewards;
    } else {
      totalUserPendingRewards = 0;
    }

    _unlockOrMintAsset(msg.sender, totalAvailableRewards);
    emit WithdrawRewards(poolAddresses, msg.sender, totalAvailableRewards);
  }

  function getPoolPendingRewards(address poolAddress, address user) public view returns (uint256) {
    if (lastRewardCursor == 0) return 0;
    uint256 head = ICalculator(rewardCalculator).rewardHead();
    uint256 rewardsReadyToMintedToPools = (ICalculator(rewardCalculator).calculateReward(
      address(this),
      lastRewardCursor,
      head
    ) * (10000 - feeRatio)) / 10000;
    uint256 stakedAmount = IPool(poolAddress).getUserStakedAmount(user);
    if (stakedAmount == 0) return userRewards[poolAddress][user];
    uint256 totalStakedAmount = IPool(poolAddress).getTotalStakedAmount();
    uint256 pendingPoolRewards = (rewardsReadyToMintedToPools * 1e12 * poolRatios[poolAddress]) / CONSTANTS_10000;
    uint256 _shareAcc = poolAcc[poolAddress] + (pendingPoolRewards / totalStakedAmount);
    uint256 pending = (stakedAmount * _shareAcc) / 1e12 - userDebts[poolAddress][user];
    return userRewards[poolAddress][user] + pending;
  }

  function getTotalPendingRewards(address user) external view returns (uint256) {
    uint256 rewards = 0;
    for (uint256 i = 0; i < createdPools.length; i++) {
      rewards = rewards + getPoolPendingRewards(createdPools[i], user);
    }
    return rewards;
  }

  function poolActived(address pool) external view override returns (bool) {
    return openedPools[pool];
  }

  function getShareAcc(address pool) external view override returns (uint256) {
    return poolAcc[pool];
  }

  function getCommunityToken() external view override returns (address) {
    return communityToken;
  }

  function getCommittee() external view override returns (address) {
    return committee;
  }

  function getLastRewardCursor() external view returns (uint256) {
    return lastRewardCursor;
  }

  function getUserDebt(address pool, address user) external view override returns (uint256) {
    return userDebts[pool][user];
  }

  function appendUserReward(address user, uint256 amount) external override onlyPool {
    userRewards[msg.sender][user] = userRewards[msg.sender][user] + amount;
  }

  function setUserDebt(address user, uint256 debt) external override onlyPool {
    userDebts[msg.sender][user] = debt;
  }

  function updatePools() external override onlyPool {
    _updatePoolsInternal();
  }

  function _updatePoolsInternal() private {
    uint256 rewardsReadyToMinted = 0;
    uint256 head = ICalculator(rewardCalculator).rewardHead();

    if (lastRewardCursor == 0) {
      lastRewardCursor = head;
      return;
    }

    if (head <= lastRewardCursor) return;

    rewardsReadyToMinted = ICalculator(rewardCalculator).calculateReward(address(this), lastRewardCursor, head);

    if (rewardsReadyToMinted > 0) {
      if (feeRatio > 0) {
        uint256 feeAmount = (rewardsReadyToMinted * feeRatio) / CONSTANTS_10000;
        retainedRevenue = retainedRevenue + feeAmount;
        rewardsReadyToMinted = rewardsReadyToMinted - feeAmount;
        emit PoolUpdated(msg.sender, feeAmount);
      }
      totalUserPendingRewards += rewardsReadyToMinted;
    }

    for (uint256 i = 0; i < activedPools.length; i++) {
      address poolAddress = activedPools[i];
      uint256 totalStakedAmount = IPool(poolAddress).getTotalStakedAmount();
      if (totalStakedAmount == 0 || poolRatios[poolAddress] == 0) continue;
      uint256 poolRewards = (rewardsReadyToMinted * 1e12 * poolRatios[poolAddress]) / CONSTANTS_10000;
      poolAcc[poolAddress] = poolAcc[poolAddress] + (poolRewards / totalStakedAmount);
    }

    lastRewardCursor = head;
  }

  function _checkRatioSum(uint16[] memory ratios) private pure {
    uint256 ratioSum = 0;
    for (uint256 i = 0; i < ratios.length; i++) {
      ratioSum += ratios[i];
    }
    require(ratioSum == uint256(CONSTANTS_10000) || ratioSum == 0, "RS!=1w");
  }

  function _updatePoolRatios(uint16[] memory ratios) private {
    for (uint256 i = 0; i < activedPools.length; i++) {
      poolRatios[activedPools[i]] = ratios[i];
    }
    emit AdminSetPoolRatio(activedPools, ratios);
  }

  function _unlockOrMintAsset(address recipient, uint256 amount) private {
    if (isMintableCommunityToken) {
      mintERC20(communityToken, address(recipient), amount);
    } else {
      releaseERC20(communityToken, address(recipient), amount);
    }
  }
}
