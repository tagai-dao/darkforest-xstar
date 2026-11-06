// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import "nutbox/interfaces/IPoolFactory.sol";
import "nutbox/dapps/dfxstar-score-staking/DFXStarScoreStaking.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "nutbox/CommunityFactory.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract DFXStarScoreStakingFactory is IPoolFactory, Ownable2Step {
  address public immutable communityFactory;
  address public immutable poolTemplate;

  mapping(address => bool) public isAdmin;

  event AdminAdded(address indexed admin);
  event AdminRemoved(address indexed admin);
  event DFXStarScoreStakingCreated(address indexed pool, address indexed community, string name);

  constructor(address _communityFactory) Ownable(msg.sender) {
    require(_communityFactory != address(0), "Invalid address");
    communityFactory = _communityFactory;
    poolTemplate = address(new DFXStarScoreStaking());
  }

  function addAdmin(address _admin) external onlyOwner {
    require(_admin != address(0), "Invalid address");
    require(!isAdmin[_admin], "Already admin");
    isAdmin[_admin] = true;
    emit AdminAdded(_admin);
  }

  function removeAdmin(address _admin) external onlyOwner {
    require(isAdmin[_admin], "Not admin");
    isAdmin[_admin] = false;
    emit AdminRemoved(_admin);
  }

  function createPool(address community, string memory name, bytes calldata) external override returns (address) {
    require(community == msg.sender, "Permission denied: caller is not community");
    require(CommunityFactory(payable(communityFactory)).createdCommunity(community), "Invalid community");

    address clone = Clones.clone(poolTemplate);
    DFXStarScoreStaking pool = DFXStarScoreStaking(payable(clone));
    pool.initialize(community);

    emit DFXStarScoreStakingCreated(address(pool), community, name);

    return address(pool);
  }
}
