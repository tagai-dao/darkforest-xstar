// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import "nutbox/Community.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "nutbox/interfaces/ICalculator.sol";
import "nutbox/interfaces/ICommittee.sol";
import "nutbox/interfaces/ICommunityTokenFactory.sol";
import "nutbox/community-token/MintableERC20.sol";

contract CommunityFactory {
  address immutable committee;
  address immutable communityTemplate;
  mapping(address => bool) public createdCommunity;

  struct CreateParams {
    bool isMintable;
    address communityToken;
    address communityTokenFactory;
    address rewardCalculator;
  }

  event CommunityCreated(address indexed creator, address indexed community, address communityToken);

  constructor(address _committee) {
    require(_committee != address(0), "Invalid committee");
    committee = _committee;
    communityTemplate = address(new Community());
  }

  function createCommunity(
    bool isMintable,
    address communityToken,
    address communityTokenFactory,
    bytes calldata tokenMeta,
    address rewardCalculator,
    bytes calldata distributionPolicy
  ) external payable returns (address) {
    CreateParams memory params = CreateParams({
      isMintable: isMintable,
      communityToken: communityToken,
      communityTokenFactory: communityTokenFactory,
      rewardCalculator: rewardCalculator
    });
    return _createCommunity(params, tokenMeta, distributionPolicy);
  }

  function _createCommunity(
    CreateParams memory params,
    bytes calldata tokenMeta,
    bytes calldata distributionPolicy
  ) internal returns (address) {
    _chargeFee();
    require(ICommittee(committee).verifyContract(params.rewardCalculator), "UC");

    bool needGrantRole = false;
    if (params.communityToken == address(0)) {
      needGrantRole = true;
      params.isMintable = true;
      require(ICommittee(committee).verifyContract(params.communityTokenFactory), "UTC");
      params.communityToken = ICommunityTokenFactory(params.communityTokenFactory).createCommunityToken(tokenMeta);
    }

    address clone = Clones.clone(communityTemplate);
    Community(payable(clone)).initialize(
      msg.sender,
      committee,
      params.communityToken,
      params.rewardCalculator,
      params.isMintable
    );

    if (needGrantRole) {
      MintableERC20(params.communityToken).grantRole(MintableERC20(params.communityToken).MINTER_ROLE(), clone);
    }

    ICalculator(params.rewardCalculator).setDistributionEra(clone, distributionPolicy);
    createdCommunity[clone] = true;
    emit CommunityCreated(msg.sender, clone, params.communityToken);
    return clone;
  }

  function _chargeFee() internal {
    uint256 fee = ICommittee(committee).getCreateCommunityFee();
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
}
