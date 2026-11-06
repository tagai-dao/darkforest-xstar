// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "nutbox/interfaces/IHourlyTickCalculator.sol";
import "nutbox/interfaces/ICommunity.sol";

/// @notice 与 TagAI-contract-V2 中 AIPRO 社区所用 HourlyTickCalculator 对齐。
/// @dev 注入按小时分桶，168 小时线性释放。本地 OpenZeppelin 5 把 ReentrancyGuard 放在 utils 下。
contract HourlyTickCalculator is IHourlyTickCalculator, ReentrancyGuard {
  using SafeERC20 for IERC20;

  uint256 public constant VEST_WINDOW = 168;

  error CommunityNotRegistered();
  error ZeroAmount();
  error OnlyFactory();
  error AlreadyRegistered();

  event Injected(address indexed community, uint256 hourIndex, uint256 amount, uint256 totalInjectedSoFar);
  event CommunityRegistered(address indexed community, address token);

  struct Injection {
    uint256 startHour;
    uint256 amount;
    uint256 cumAmount;
    uint256 cumAmountStart;
  }

  address public immutable communityFactory;

  mapping(address => bool) public registered;
  mapping(address => address) public communityToken;
  mapping(address => uint256) public totalInjected;
  mapping(address => Injection[]) internal _injections;

  modifier onlyFactory() {
    if (msg.sender != communityFactory) revert OnlyFactory();
    _;
  }

  constructor(address _communityFactory) {
    communityFactory = _communityFactory;
  }

  /// @dev AIPRO 创建社区时传入空 policy。这里只登记社区，不解析线性释放参数。
  function setDistributionEra(address community, bytes calldata) external onlyFactory returns (bool) {
    if (registered[community]) revert AlreadyRegistered();

    registered[community] = true;
    communityToken[community] = ICommunity(community).getCommunityToken();

    emit CommunityRegistered(community, communityToken[community]);
    return true;
  }

  function rewardHead() external view returns (uint256) {
    // 对齐到当前小时起点。先除再乘是为了丢掉不足一小时的秒数。
    uint256 hourIndex = block.timestamp / 3600;
    return hourIndex * 3600;
  }

  function calculateReward(address community, uint256 lastCursor, uint256 head) external view returns (uint256) {
    if (head <= lastCursor) return 0;

    uint256 a = lastCursor / 3600;
    uint256 b = head / 3600;

    return _cumulativeReward(community, b) - _cumulativeReward(community, a);
  }

  function getCurrentRewardRate(address community) external view returns (uint256) {
    Injection[] storage injs = _injections[community];
    if (injs.length == 0) return 0;

    uint256 currentHour = block.timestamp / 3600;
    uint256 totalRate = 0;

    for (uint256 i = injs.length; i > 0; ) {
      unchecked {
        --i;
      }
      uint256 sh = injs[i].startHour;
      if (sh >= currentHour) continue;
      if (sh + VEST_WINDOW <= currentHour) break;
      totalRate += injs[i].amount / VEST_WINDOW;
    }

    return totalRate;
  }

  function getStartCursor(address community) external view returns (uint256) {
    Injection[] storage injs = _injections[community];
    if (injs.length == 0) return 0;
    return injs[0].startHour * 3600;
  }

  function inject(address community, uint256 amount) external nonReentrant {
    if (!registered[community]) revert CommunityNotRegistered();
    if (amount == 0) revert ZeroAmount();

    address token = communityToken[community];
    IERC20(token).safeTransferFrom(msg.sender, community, amount);

    uint256 hourIndex = block.timestamp / 3600;
    Injection[] storage injs = _injections[community];

    if (injs.length > 0 && injs[injs.length - 1].startHour == hourIndex) {
      Injection storage last = injs[injs.length - 1];
      last.amount += amount;
      last.cumAmount += amount;
      last.cumAmountStart += amount * hourIndex;
    } else {
      uint256 prevCumAmount = injs.length > 0 ? injs[injs.length - 1].cumAmount : 0;
      uint256 prevCumAmountStart = injs.length > 0 ? injs[injs.length - 1].cumAmountStart : 0;

      injs.push(
        Injection({
          startHour: hourIndex,
          amount: amount,
          cumAmount: prevCumAmount + amount,
          cumAmountStart: prevCumAmountStart + amount * hourIndex
        })
      );
    }

    totalInjected[community] += amount;
    emit Injected(community, hourIndex, amount, totalInjected[community]);
  }

  function getHourlyRewards(
    address community,
    uint256 startTimestamp,
    uint256 numHours
  ) external view returns (uint256[] memory rewards) {
    rewards = new uint256[](numHours);
    uint256 startHourIdx = startTimestamp / 3600;
    uint256 prevF = _cumulativeReward(community, startHourIdx);

    for (uint256 i = 0; i < numHours; i++) {
      uint256 nextF = _cumulativeReward(community, startHourIdx + i + 1);
      rewards[i] = nextF - prevF;
      prevF = nextF;
    }
  }

  /// @dev `ended` / `started` 是第一条尚未满足条件的下标，所以减 1 才是最后一条已满足的注入。
  function _cumulativeReward(address community, uint256 t) internal view returns (uint256) {
    Injection[] storage injs = _injections[community];
    if (injs.length == 0) return 0;

    uint256 ended = t >= VEST_WINDOW ? _upperBound(injs, t - VEST_WINDOW) : 0;
    uint256 fullyVested = ended > 0 ? injs[ended - 1].cumAmount : 0;

    uint256 started = t > 0 ? _upperBound(injs, t - 1) : 0;
    if (started <= ended) return fullyVested;

    uint256 sumAmount = injs[started - 1].cumAmount - fullyVested;
    uint256 sumAmountStart = injs[started - 1].cumAmountStart - (ended > 0 ? injs[ended - 1].cumAmountStart : 0);
    return fullyVested + (t * sumAmount - sumAmountStart) / VEST_WINDOW;
  }

  function _upperBound(Injection[] storage injs, uint256 target) internal view returns (uint256) {
    uint256 lo = 0;
    uint256 hi = injs.length;
    while (lo < hi) {
      uint256 mid = (lo + hi) / 2;
      if (injs[mid].startHour <= target) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }
}
