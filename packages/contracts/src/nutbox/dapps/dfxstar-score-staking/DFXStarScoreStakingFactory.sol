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
  // 一个 World 只能有一个积分池。同一个地址再创建一次会失败。
  mapping(address => address) public poolOfWorld;

  event AdminAdded(address indexed admin);
  event AdminRemoved(address indexed admin);
  event DFXStarScoreStakingCreated(address indexed pool, address indexed community, string name);
  event WorldBound(address indexed world, address indexed pool);

  constructor(address _communityFactory) Ownable(msg.sender) {
    require(_communityFactory != address(0), "Invalid address");
    communityFactory = _communityFactory;
    poolTemplate = address(new DFXStarScoreStaking());
  }

  /// @dev 这个名单不再决定谁能记分。depositFromGame 只认池子上的 World。
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

  /// @dev meta 是 abi.encode(world)。社区管理员在创建时填这个 World，池子里之后改不了。
  function createPool(address community, string memory name, bytes calldata meta) external override returns (address) {
    require(community == msg.sender, "Permission denied: caller is not community");
    require(CommunityFactory(payable(communityFactory)).createdCommunity(community), "Invalid community");
    require(meta.length == 32, "World meta");
    address world = abi.decode(meta, (address));
    require(world != address(0), "Invalid world");
    require(poolOfWorld[world] == address(0), "World already bound");

    address clone = Clones.clone(poolTemplate);
    DFXStarScoreStaking pool = DFXStarScoreStaking(payable(clone));
    pool.initialize(community, world);
    poolOfWorld[world] = address(pool);

    emit DFXStarScoreStakingCreated(address(pool), community, name);
    emit WorldBound(world, address(pool));
    return address(pool);
  }
}
