import WalletButton from "@wallet/WalletButton";

import { CreateMoveForm } from "./CreateMoveFormTest";
import { CreatePlanetForm } from "./CreatePlanetFormTest";
import { DFXStarIntegrationPanel } from "./DFXStarIntegrationPanel";
import { GamePassAdminPanel } from "./GamePassAdminPanel";
import { PlanetReadForm } from "./PlanetReadForm";
import { PlanetUpgradeBranchForm } from "./PlanetUpgradeFormBranchTest";
import { PlanetUpgradeForm } from "./PlanetUpgradeFormTest";
import PlayerForm from "./PlayerForm";
import { PlayPauseTickButton } from "./PlayPauseTickButton";
import { ProofVerificationForm } from "./ProofVerificationForm";
import { RevealPlanetForm } from "./RevealPlanetForm";

export const PlanetTestPage = () => {
  // Function to handle planet creation
  const handleCreatePlanet = (
    planetHash: string,
    owner: string,
    perlin: number,
    level: number,
    planetType: number,
    spaceType: number,
    population: number,
    silver: number,
    upgrade: number,
  ) => {
    console.log("Planet Created:", {
      planetHash,
      owner,
      perlin,
      level,
      planetType,
      spaceType,
      population,
      silver,
      upgrade,
    });

    // Here you can call the df__createPlanet function (smart contract interaction) using MUD's system call
    // df__createPlanet(planetHash, owner, perlin, level, planetType, spaceType, population, silver);
  };
  const handlePlanetUpgradeSubmit = async (
    planetHash: string,
    rangeUpgrades: number,
    speedUpgrades: number,
    defenseUpgrades: number,
  ) => {
    console.log("Upgrade sent:", {
      planetHash,
      rangeUpgrades,
      speedUpgrades,
      defenseUpgrades,
    });
  };

  const handlePlanetBranchUpgradeSubmit = async (
    planetHash: string,
    branch: number,
  ) => {
    console.log("Upgrade sent:", {
      planetHash,
      branch,
    });
  };

  return (
    <div className="p-6">
      <div className="p-6">
        <WalletButton />
      </div>
      <div className="mb-4">
        <GamePassAdminPanel />
      </div>
      <div className="mb-4">
        <DFXStarIntegrationPanel />
      </div>
      <div className="flex items-start gap-4">
        <div className="mt-6">
          <PlayPauseTickButton />
        </div>
        <div className="flex flex-col">
          {" "}
          <PlayerForm />
          {/* <SpawnPlayer/> */}
        </div>
        <div className="flex">
          <CreatePlanetForm onSubmit={handleCreatePlanet} />
        </div>

        <div className="flex">
          <PlanetReadForm />
        </div>
        <div className="flex">
          <PlanetUpgradeForm onSubmit={handlePlanetUpgradeSubmit} />
          <PlanetUpgradeBranchForm onSubmit={handlePlanetBranchUpgradeSubmit} />
        </div>

        <div>
          <RevealPlanetForm />
        </div>
      </div>

      <div className="flex items-start gap-4 pt-4">
        <div className="flex">
          <ProofVerificationForm />
        </div>{" "}
        <div className="flex">
          <CreateMoveForm />
        </div>
      </div>
    </div>
  );
};
