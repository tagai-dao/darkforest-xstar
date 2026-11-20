import type { Monomitter } from "@df/events";
import { monomitter } from "@df/events";
import type { ArtifactId, BombPlan, LocationId } from "@df/types";

/**
 * “使用粉红炸弹”时界面上的选择：从哪颗星球、哪件神器出发，要不要在地图上点目标，选了哪个目标。
 *
 * 同一时间只记一件炸弹。变化时通过 changed$ 通知界面重绘；
 * 界面拿到通知后应该再调用 get() 读最新值，不要只信事件里带的值。
 */
export class BombPlanState {
  public readonly changed$: Monomitter<BombPlan | undefined> = monomitter<
    BombPlan | undefined
  >();

  private plan: BombPlan | undefined;

  public get(): BombPlan | undefined {
    return this.plan;
  }

  /** 是否正在等玩家在地图上点目标星球 */
  public isPicking(): boolean {
    return this.plan?.picking === true;
  }

  /**
   * 进入“点地图选目标”。
   * 同一件神器重新选时，保留原来的目标，直到点了新的；换了神器就从头来。
   */
  public startPicking(planetId: LocationId, artifactId: ArtifactId): void {
    const sameArtifact = this.plan?.artifactId === artifactId;
    this.set({
      planetId,
      artifactId,
      picking: true,
      targetId: sameArtifact ? this.plan?.targetId : undefined,
    });
  }

  /** 取消点选。已经选过目标就保留目标，一个目标都没有就整个清掉。 */
  public cancelPicking(): void {
    if (!this.plan) return;
    if (!this.plan.targetId) {
      this.clear();
      return;
    }
    this.set({ ...this.plan, picking: false });
  }

  /** 选定目标，同时结束点选。没有进行中的方案时忽略。 */
  public chooseTarget(targetId: LocationId): void {
    if (!this.plan) return;
    this.set({ ...this.plan, targetId, picking: false });
  }

  public clear(): void {
    if (!this.plan) return;
    this.set(undefined);
  }

  /** 选中的星球变了：只要不是炸弹所在的那颗，就放弃这次选择。 */
  public keepOnlyForPlanet(selectedPlanetId: LocationId | undefined): void {
    if (this.plan && this.plan.planetId !== selectedPlanetId) {
      this.clear();
    }
  }

  private set(plan: BombPlan | undefined): void {
    this.plan = plan;
    this.changed$.publish(plan);
  }
}
