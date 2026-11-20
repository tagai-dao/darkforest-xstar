import type { Monomitter } from "@df/events";
import { monomitter } from "@df/events";
import type { ArtifactId, BombVictimPick, LocationId } from "@df/types";

/**
 * 粉红炸弹摧毁阶段的选择：要摧毁哪颗星球，是否正在等玩家在地图上点。
 *
 * 和 BombPlanState（选落点）分开，因为两个阶段不会同时出现，
 * 但各自的规则不同：落点是点任意已知星球，受害星球只能点爆炸范围内的。
 * 变化时通过 changed$ 通知界面重绘；界面拿到通知后应再调用 get() 读最新值。
 */
export class BombVictimState {
  public readonly changed$: Monomitter<BombVictimPick | undefined> = monomitter<
    BombVictimPick | undefined
  >();

  private pick: BombVictimPick | undefined;

  public get(): BombVictimPick | undefined {
    return this.pick;
  }

  public isPicking(): boolean {
    return this.pick?.picking === true;
  }

  /** 进入“点地图选要摧毁的星球”。同一件炸弹重新点选时，保留已选的那颗。 */
  public startPicking(planetId: LocationId, artifactId: ArtifactId): void {
    const sameArtifact = this.pick?.artifactId === artifactId;
    this.set({
      planetId,
      artifactId,
      picking: true,
      victimId: sameArtifact ? this.pick?.victimId : undefined,
    });
  }

  /** 取消点选，已选的星球保留。 */
  public cancelPicking(): void {
    if (!this.pick) return;
    this.set({ ...this.pick, picking: false, rejectedId: undefined });
  }

  /** 选定要摧毁的星球（来自下拉框或地图），同时结束点选。 */
  public choose(
    planetId: LocationId,
    artifactId: ArtifactId,
    victimId: LocationId,
  ): void {
    this.set({ planetId, artifactId, picking: false, victimId });
  }

  /** 点到了不能摧毁的星球：记下来给提示，仍然留在点选状态。 */
  public reject(rejectedId: LocationId): void {
    if (!this.pick) return;
    this.set({ ...this.pick, rejectedId });
  }

  public clear(): void {
    if (!this.pick) return;
    this.set(undefined);
  }

  /** 选中的星球变了：只要不是炸弹的出发星球，就放弃这次选择。 */
  public keepOnlyForPlanet(selectedPlanetId: LocationId | undefined): void {
    if (this.pick && this.pick.planetId !== selectedPlanetId) {
      this.clear();
    }
  }

  private set(pick: BombVictimPick | undefined): void {
    this.pick = pick;
    this.changed$.publish(pick);
  }
}
