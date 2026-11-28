import {
  BLOCK_EXPLORER_URL,
  BLOCKCHAIN_BRIDGE,
  BLOCKCHAIN_NAME,
  HOW_TO_ENABLE_POPUPS,
  HOW_TO_TRANSFER_ETH_FROM_L2_TO_REDSTONE,
  PLAYER_GUIDE,
  TOKEN_NAME,
  VERSION,
} from "@df/constants";
import { WORLD_NAME } from "@df/constants";
import type { EthConnection } from "@df/network";
import { neverResolves, weiToEth } from "@df/network";
import { address } from "@df/serde";
import { addressToHex } from "@df/serde";
import type { EthAddress, UnconfirmedUseKey } from "@df/types";
import { reversed } from "@df/utils/list";
import { bigIntFromKey } from "@df/whitelist";
import { RegisterPlayerComponent } from "@frontend/Components/RegisterPlayerComponent";
import { WalletModal } from "@frontend/Components/WalletModal";
import { useBurnerBalance, useMainWalletBalance } from "@hooks/useBalance";
import { useStore as useStoreHook } from "@hooks/useStore";
import { useComponentValue } from "@latticexyz/react";
import { getComponentValue } from "@latticexyz/recs";
import {
  decodeEntity,
  encodeEntity,
  singletonEntity,
} from "@latticexyz/store-sync/recs";
import { getNetworkConfig } from "@mud/getNetworkConfig";
import { useMUD } from "@mud/MUDContext";
import { RedPillRegisterPlayer } from "@redpill/RedPillRegisterPlayer";
import { LOW_BALANCE_THRESHOLD, RECOMMENDED_BALANCE } from "@wallet/utils";
import { utils, Wallet } from "ethers";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import styled from "styled-components";
import { zeroAddress } from "viem";

import { ZKArgIdx } from "../../_types/darkforest/api/ContractsAPITypes";
import { makeContractsAPI } from "../../Backend/GameLogic/ContractsAPI";
import { GameManager } from "../../Backend/GameLogic/GameManager";
import { GameManagerEvent } from "../../Backend/GameLogic/GameManager";
import { GameUIManager } from "../../Backend/GameLogic/GameUIManager";
import TutorialManager, {
  TutorialState,
} from "../../Backend/GameLogic/TutorialManager";
import { toExploredChunk } from "../../Backend/Miner/ChunkUtils";
import { addAccount, getAccounts } from "../../Backend/Network/AccountManager";
import {
  getEthConnection,
  loadDiamondContract,
} from "../../Backend/Network/Blockchain";
import type { RegisterConfirmationResponse } from "../../Backend/Network/UtilityServerAPI";
import {
  callRegisterAndWaitForConfirmation,
  EmailResponse,
  requestDevFaucet,
  submitInterestedEmail,
  submitPlayerEmail,
} from "../../Backend/Network/UtilityServerAPI";
import {
  type ActionRecord,
  type BoardCursor,
  readWalletActions,
  readWalletTail,
  readWatchedHome,
} from "../../Backend/Save/FileChunkSource";
import { type FolderCard, readFolderCard } from "../../Backend/Save/FolderCard";
import type { GameSaveFiles } from "../../Backend/Save/GameSave";
import { loadSelectedGame } from "../../Backend/Save/loadSelectedGame";
import {
  directoryPermission,
  loadWalletDirectory,
  saveWalletDirectory,
} from "../../Backend/Save/WalletFolderCache";
import { getWhitelistArgs } from "../../Backend/Utils/WhitelistSnarkArgsHelper";
import type { BrowserCompatibleState } from "../Components/BrowserIssues";
import { BrowserIssues } from "../Components/BrowserIssues";
import {
  GameWindowWrapper,
  InitRenderState,
  TerminalToggler,
  TerminalWrapper,
  Wrapper,
} from "../Components/GameLandingPageComponents";
import { MythicLabelText } from "../Components/Labels/MythicLabel";
import type { MiniMapHandle } from "../Components/MiniMap";
import { MiniMap } from "../Components/MiniMap";
import { TextMask } from "../Components/TextMask";
import Viewport from "../Game/Viewport";
import dfstyles from "../Styles/dfstyles";
import { TopLevelDivProvider, UIManagerProvider } from "../Utils/AppHooks";
import type { Incompatibility } from "../Utils/BrowserChecks";
import { unsupportedFeatures } from "../Utils/BrowserChecks";
import { TerminalTextStyle } from "../Utils/TerminalTypes";
import UIEmitter, { UIEmitterEvent } from "../Utils/UIEmitter";
import { GameWindowLayout } from "../Views/GameWindowLayout";
import type { TerminalHandle } from "../Views/Terminal";
import { Terminal } from "../Views/Terminal";
import { HomeLobby } from "./HomeLobby";
import { useHomeAssets } from "./useHomeAssets";
const enum TerminalPromptStep {
  NONE,
  COMPATIBILITY_CHECKS_PASSED,
  DISPLAY_ACCOUNTS,
  GENERATE_ACCOUNT,
  IMPORT_ACCOUNT,
  ACCOUNT_SET,
  ASKING_HAS_WHITELIST_KEY,
  ASKING_WAITLIST_EMAIL,
  ASKING_WHITELIST_KEY,
  ASKING_PLAYER_EMAIL,
  FETCHING_ETH_DATA,
  ASK_ADD_ACCOUNT,
  ADD_ACCOUNT,
  NO_HOME_PLANET,
  SEARCHING_FOR_HOME_PLANET,
  ALL_CHECKS_PASS,
  COMPLETE,
  TERMINATED,
  ERROR,
  SPECTATING,
}

type TerminalStateOptions = {
  showHelp: boolean;
};

const LoadingContent = styled.div`
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: ${dfstyles.colors.dfpink};
  gap: 1em;
`;

const LoadingText = styled.div`
  font-size: 1.7em;
  text-align: center;
`;

const LoadingNote = styled.div`
  font-size: 1.5em;
  color: ${dfstyles.colors.dfpink};
  text-align: center;
`;

const Spinner = styled.div`
  width: 50px;
  height: 50px;
  border: 4px solid ${dfstyles.colors.text};
  border-top: 4px solid ${dfstyles.colors.dfpink};
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 20px 0;

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`;

export function RedPillLandingPage() {
  const navigate = useNavigate();
  const { contract } = useParams();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const queryParam = params.toString();
  const {
    network: { localVoyages },
    components: components, //{ SyncProgress },
  } = useMUD();

  const { Player } = components;

  const syncProgress = useComponentValue(
    components.SyncProgress,
    singletonEntity,
    {
      message: "Connecting",
      percentage: 0,
      step: "Initialize",
      latestBlockNumber: 0n,
      lastBlockNumberProcessed: 0n,
    },
  );

  const terminalHandle = useRef<TerminalHandle>(null);
  const gameUIManagerRef = useRef<GameUIManager | null>(null);
  const topLevelContainer = useRef<HTMLDivElement>(null);
  const miniMapRef = useRef<MiniMapHandle>();

  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const [gameManager, setGameManager] = useState<GameManager | undefined>();
  const [terminalVisible, setTerminalVisible] = useState(true);
  const [initRenderState, setInitRenderState] = useState(InitRenderState.NONE);
  const [ethConnection, setEthConnection] = useState<
    EthConnection | undefined
  >();
  const [step, setStep] = useState(TerminalPromptStep.NONE);

  const [browserCompatibleState, setBrowserCompatibleState] =
    useState<BrowserCompatibleState>("unknown");
  const [browserIssues, setBrowserIssues] = useState<Incompatibility[]>([]);
  const [isMiniMapOn, setMiniMapOn] = useState(false);
  const [spectate, setSpectate] = useState(false);
  const [folderSave, setFolderSave] = useState<GameSaveFiles | undefined>();
  const [watchToken, setWatchToken] = useState(0);
  const [homeReady, setHomeReady] = useState(false);
  const [actionLog, setActionLog] = useState<ActionRecord[]>([]);
  const [folderLoad, setFolderLoad] = useState<
    | { kind: "idle" }
    | { kind: "busy"; done: number; total: number; label: string }
    | { kind: "blocked"; title: string; detail: string }
  >({ kind: "idle" });
  const folderHandleRef = useRef<FileSystemDirectoryHandle | undefined>(
    undefined,
  );
  // 离开游戏时递增，停掉还在等终端输入的那一轮。
  const sessionRef = useRef(0);
  const [folderCard, setFolderCard] = useState<FolderCard | undefined>();
  const [importNotice, setImportNotice] = useState<string | undefined>();
  const [importing, setImporting] = useState(false);
  const grantedFolderRef = useRef<FileSystemDirectoryHandle | undefined>(
    undefined,
  );
  const homeAssets = useHomeAssets(!gameManager);
  const boardCursorRef = useRef<BoardCursor>({
    offset: 0,
    homeModified: 0,
    homeSize: 0,
    actionsOffset: 0,
    priceModified: 0,
    priceSize: 0,
  });
  const gateSeededRef = useRef(false);
  const gameManagerRef = useRef(gameManager);
  gameManagerRef.current = gameManager;

  // NOTE: round 2
  const useZkWhitelist = true;
  // const useZkWhitelist = params.has('zkWhitelist');
  const selectedAddress = params.get("account");
  const contractAddress = contract ? address(contract) : address(zeroAddress);
  const isLobby = false; // NOTE: contractAddress !== address(CONTRACT_ADDRESS);

  const syncSign = useMemo(() => {
    console.log(syncProgress.step, syncProgress.percentage);
    return syncProgress.step === "live" && syncProgress.percentage == 100;
  }, [syncProgress]);

  useEffect(() => {
    getEthConnection()
      .then((ethConnection) => setEthConnection(ethConnection))
      .catch((e) => {
        alert("error connecting to blockchain");
        console.log(e);
      });
  }, []);

  useEffect(() => {
    unsupportedFeatures().then((issues) => {
      const supported = issues.length === 0;
      setBrowserIssues(issues);
      if (supported) {
        setBrowserCompatibleState("supported");
        setStep(TerminalPromptStep.COMPATIBILITY_CHECKS_PASSED);
      } else {
        setBrowserCompatibleState("unsupported");
      }
    });
  }, []);

  const isProd = import.meta.env.VITE_NODE_ENV === "production";

  const advanceStateFromCompatibilityPassed = useCallback(
    async (_terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      // 人只看。选账号、新建和导入先不出现，直接进入观战。
      setSpectate(true);
      setStep(TerminalPromptStep.SPECTATING);
    },
    [],
  );

  const advanceStateFromDisplayAccounts = useCallback(
    async (
      terminal: React.MutableRefObject<TerminalHandle | undefined>,
      { showHelp }: TerminalStateOptions = {
        showHelp: true,
      },
    ) => {
      const accounts = getAccounts();
      const totalAccounts = accounts.length;
      if (showHelp) {
        terminal.current?.println(
          "Login with existing account.",
          TerminalTextStyle.Green,
        );
        terminal.current?.println("select account.", TerminalTextStyle.Sub);
        terminal.current?.println("");

        for (let i = 0; i < accounts.length; i += 1) {
          const rawResult = await ethConnection?.loadBalance(
            accounts[i].address,
          );
          const balance = rawResult ? weiToEth(rawResult) : 0;

          terminal.current?.print(
            `(${i + 1}): ${accounts[i].address}  `,
            TerminalTextStyle.Sub,
          );
          if (balance < 0.00001) {
            terminal.current?.print(
              balance.toFixed(9) + " " + TOKEN_NAME,
              TerminalTextStyle.Red,
            );
            terminal.current?.println(
              " => select this account to know how to get enough BNB",
            );
          } else {
            terminal.current?.println(
              balance.toFixed(9) + " " + TOKEN_NAME,
              TerminalTextStyle.Green,
            );
          }
        }
        terminal.current?.println("");

        let accountsMessage = "Select account option [1], then press [enter].";
        if (totalAccounts > 1) {
          const args = [...Array(totalAccounts - 1)].map(
            (_, i) => `[${i + 1}]`,
          );
          accountsMessage = `Select one of the account options ${args.join(
            ", ",
          )} or [${totalAccounts}], then press [enter].`;
        }

        terminal.current?.println(accountsMessage, TerminalTextStyle.Sub);
      }

      const userInput = (await terminal.current?.getInput())?.trim() ?? "";
      const selection = userInput !== "" ? Number(userInput) : NaN;

      // stop option, go to next step
      if (
        Number.isInteger(selection) &&
        accounts[selection - 1] !== undefined
      ) {
        const account = accounts[selection - 1];
        try {
          await ethConnection?.setAccount(account.privateKey);
          setStep(TerminalPromptStep.ACCOUNT_SET);
        } catch (e) {
          terminal.current?.println(
            "An unknown error occurred. please refresh the client.",
            TerminalTextStyle.Red,
          );
          advanceStateFromDisplayAccounts(terminal, {
            showHelp: false,
          });
        }
        return;
      }

      // continue waiting for user input
      switch (true) {
        case userInput === "clear": {
          terminal.current?.clear();
          showHelp = false;
          break;
        }
        case userInput === "h" || userInput === "help": {
          showHelp = true;
          break;
        }
        default: {
          terminal.current?.println(
            "Invalid option, please try press [help].",
            TerminalTextStyle.Pink,
          );
          showHelp = false;
        }
      }

      advanceStateFromDisplayAccounts(terminal, { showHelp });
    },
    [ethConnection],
  );

  const advanceStateFromGenerateAccount = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      const newWallet = Wallet.createRandom();
      const newSKey = newWallet.privateKey;
      const newAddr = address(newWallet.address);

      try {
        addAccount(newSKey);
        ethConnection?.setAccount(newSKey);

        terminal.current?.println(``);
        terminal.current?.print(`Created new burner wallet account `);
        terminal.current?.print(newAddr, TerminalTextStyle.Pink);

        terminal.current?.println(``);
        terminal.current?.println("");
        terminal.current?.println(
          "NOTE: Burner wallets are stored in local storage.",
          TerminalTextStyle.Pink,
        );
        terminal.current?.println(
          "They are relatively insecure and you should avoid ",
        );
        terminal.current?.println("storing substantial funds in them.");
        terminal.current?.println("");
        terminal.current?.println(
          "Also, clearing browser local storage/cache will render your",
        );
        terminal.current?.println(
          "burner wallets inaccessible, unless you export your private keys.",
        );
        terminal.current?.println("");
        terminal.current?.println("Press [enter] to continue.");

        await terminal.current?.getInput();
        setStep(TerminalPromptStep.ACCOUNT_SET);
      } catch (e) {
        // unwanted state, user will need to reload browser here
        terminal.current?.println(
          "An unknown error occurred. please refresh the client.",
          TerminalTextStyle.Red,
        );
      }
    },
    [ethConnection],
  );

  const advanceStateFromImportAccount = useCallback(
    async (
      terminal: React.MutableRefObject<TerminalHandle | undefined>,
      { showHelp }: TerminalStateOptions = {
        showHelp: true,
      },
    ) => {
      if (showHelp) {
        terminal.current?.println(
          "Import private key.",
          TerminalTextStyle.Green,
        );
        terminal.current?.println(
          "Enter the 0x-prefixed private key of the account you wish to import",
          TerminalTextStyle.Text,
        );
        terminal.current?.println(
          "NOTE: THIS WILL STORE THE PRIVATE KEY IN YOUR BROWSER'S LOCAL STORAGE",
          TerminalTextStyle.Text,
        );
        terminal.current?.println(
          "Local storage is relatively insecure. We recommend only importing accounts with zero-to-no funds.",
        );
      }

      const userInput = (await terminal.current?.getInput())?.trim() ?? "";
      const validSkeyPattern = /^0x[0-9a-fA-F]{64}$/;
      if (validSkeyPattern.test(userInput)) {
        try {
          const newSKey = userInput;
          const newAddr = address(utils.computeAddress(newSKey));

          addAccount(newSKey);

          ethConnection?.setAccount(newSKey);
          terminal.current?.println(
            `Imported account with address ${newAddr}.`,
          );
          setStep(TerminalPromptStep.ACCOUNT_SET);
          return;
        } catch (e) {
          terminal.current?.println(
            "An unknown error occurred. please refresh the page.",
            TerminalTextStyle.Red,
          );
          advanceStateFromImportAccount(terminal, { showHelp: false });
          return;
        }
      }

      // continue waiting for user input
      switch (true) {
        case userInput === "clear": {
          terminal.current?.clear();
          showHelp = false;
          break;
        }
        case userInput === "h" || userInput === "help": {
          showHelp = true;
          break;
        }
        default: {
          terminal.current?.println(
            "Invalid option, please try again.",
            TerminalTextStyle.Red,
          );
          showHelp = false;
        }
      }

      advanceStateFromImportAccount(terminal, { showHelp });
    },
    [ethConnection],
  );

  const advanceStateFromAccountSet = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      try {
        const playerAddress = ethConnection?.getAddress();
        if (!playerAddress || !ethConnection) {
          throw new Error("not logged in");
        }

        terminal.current?.println("Checking account balance... ");

        const balance = weiToEth(
          await ethConnection.loadBalance(playerAddress),
        );

        if (balance < 0.00001) {
          terminal.current?.print(`   Your account: `);
          terminal.current?.println(
            `${playerAddress}`,
            TerminalTextStyle.Green,
          );

          terminal.current?.print("    Private Key: ");
          terminal.current?.printElement(
            <TextMask
              maskText="Click here to get private key"
              text={ethConnection.getPrivateKey()}
              noticeText="<= click here to copy private key"
              unFocusedWidth={"150px"}
              focusedWidth={"150px"}
              style={{ color: "#00DC82" }}
            />,
          );

          terminal.current?.println("");

          terminal.current?.print(`   Your balance: `);
          terminal.current?.print(
            `${balance.toFixed(9)} ${TOKEN_NAME}`,
            TerminalTextStyle.Red,
          );

          terminal.current?.println(" <= recommend depositing 0.001 BNB");

          terminal.current?.print(`           NOTE: `, TerminalTextStyle.Pink);

          terminal.current?.println(
            "You can use bridge to transfer BNB to " +
              BLOCKCHAIN_NAME +
              " Mainnet",
            TerminalTextStyle.Pink,
          );

          terminal.current?.print("   L2-L2 bridge: ");

          terminal.current?.printLink(
            BLOCKCHAIN_BRIDGE,
            () => {
              window.open(BLOCKCHAIN_BRIDGE);
            },
            TerminalTextStyle.Green,
          );

          terminal.current?.println(
            " <= transfer BNB from L2 (e.g. optimism) to " +
              BLOCKCHAIN_NAME +
              " Mainnet",
          );

          terminal.current?.print("   Player guide: ");

          terminal.current?.printLink(
            "How to get BNB on the " +
              BLOCKCHAIN_NAME +
              " mainnet for your account",
            () => {
              window.open(HOW_TO_TRANSFER_ETH_FROM_L2_TO_REDSTONE);
            },
            TerminalTextStyle.Green,
          );
          terminal.current?.println(
            " <= New player please check this guide !!!",
            TerminalTextStyle.Pink,
          );

          terminal.current?.println("");

          terminal.current?.println(
            "After your account get BNB on " +
              BLOCKCHAIN_NAME +
              " Mainnet, press [enter] to continue.",
            TerminalTextStyle.Pink,
          );
          const userInput = (await terminal.current?.getInput())?.trim() ?? "";
          let showHelp = true;

          // continue waiting for user input
          switch (true) {
            case userInput === "": {
              advanceStateFromAccountSet(terminal);
              return;
            }
            case userInput === "clear": {
              terminal.current?.clear();
              showHelp = false;
              advanceStateFromCompatibilityPassed(terminal, {
                showHelp,
              });
              break;
            }
            case userInput === "h" || userInput === "help": {
              showHelp = true;
              advanceStateFromCompatibilityPassed(terminal, {
                showHelp,
              });
              break;
            }
            default: {
              terminal.current?.println(
                "Invalid option, please try press [help].",
                TerminalTextStyle.Pink,
              );
              showHelp = false;
              advanceStateFromCompatibilityPassed(terminal, {
                showHelp,
              });
            }
          }
          return;
        }

        // const whitelist = await ethConnection.loadContract(
        //   contractAddress,
        //   loadDiamondContract,
        // );
        // const isWhitelisted = await whitelist.isWhitelisted(playerAddress);
        // // TODO(#2329): isWhitelisted should just check the contractOwner
        // const adminAddress = address(await whitelist.adminAddress());

        // if (isWhitelisted === false && playerAddress !== adminAddress) {
        //   terminal.current?.println("");
        //   terminal.current?.println(
        //     "Registered players can enter in advance. The Game will be open to everyone soon.",
        //     TerminalTextStyle.Pink,
        //   );
        // }
        terminal.current?.println("");

        terminal.current?.print("Checking if whitelisted... ");

        const isWhitelisted = true;
        // TODO(#2329): isWhitelisted should just check the contractOwner
        // if (isWhitelisted || playerAddress === adminAddress) {
        if (isWhitelisted) {
          terminal.current?.println("Player whitelisted.");
          terminal.current?.println("");
          terminal.current?.println(`Welcome, player ${playerAddress}.`);

          // TODO: Provide own env variable for this feature
          if (!isProd) {
            // in development, automatically get some ether from faucet
            const balance = weiToEth(
              await ethConnection?.loadBalance(playerAddress),
            );
            if (balance === 0) {
              await requestDevFaucet(playerAddress);
            }
          }
          setStep(TerminalPromptStep.FETCHING_ETH_DATA);
        } else {
          setStep(TerminalPromptStep.ASKING_HAS_WHITELIST_KEY);
        }
      } catch (e) {
        console.error(`error connecting to whitelist: ${e}`);
        terminal.current?.println(
          "ERROR: Could not connect to whitelist contract. Please refresh and try again in a few minutes.",
          TerminalTextStyle.Red,
        );
        setStep(TerminalPromptStep.TERMINATED);
      }
    },
    [ethConnection, isProd, contractAddress],
  );

  const advanceStateFromAskHasWhitelistKey = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      terminal.current?.print(
        "Do you have a whitelist key?",
        TerminalTextStyle.Text,
      );
      terminal.current?.println(" (y/n)");
      const userInput = await terminal.current?.getInput();
      if (userInput === "y") {
        setStep(TerminalPromptStep.ASKING_WHITELIST_KEY);
      } else if (userInput === "n") {
        setStep(TerminalPromptStep.ASKING_WAITLIST_EMAIL);
      } else {
        terminal.current?.println("Unrecognized input. Please try again.");
        advanceStateFromAskHasWhitelistKey(terminal);
      }
    },
    [],
  );

  const advanceStateFromAskWhitelistKey = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      const address = ethConnection?.getAddress();
      if (!address) {
        throw new Error("not logged in");
      }

      terminal.current?.println(
        "Please enter your invite key (XXXXXX-XXXXXX-XXXXXX-XXXXXX):",
        TerminalTextStyle.Sub,
      );

      const key = (await terminal.current?.getInput()) || "";

      terminal.current?.print("Processing key... (this may take up to 30s)");
      terminal.current?.newline();

      if (!useZkWhitelist) {
        let registerConfirmationResponse = {} as RegisterConfirmationResponse;
        try {
          registerConfirmationResponse =
            await callRegisterAndWaitForConfirmation(key, address, terminal);
        } catch (e) {
          registerConfirmationResponse = {
            canRetry: true,
            errorMessage:
              "There was an error connecting to the whitelist server. Please try again later.",
          };
        }

        if (!registerConfirmationResponse.txHash) {
          terminal.current?.println(
            "ERROR: " + registerConfirmationResponse.errorMessage,
            TerminalTextStyle.Red,
          );
          if (registerConfirmationResponse.canRetry) {
            terminal.current?.println("Press any key to try again.");
            await terminal.current?.getInput();
            advanceStateFromAskWhitelistKey(terminal);
          } else {
            setStep(TerminalPromptStep.ASKING_WAITLIST_EMAIL);
          }
        } else {
          terminal.current?.print(
            "Successfully joined game. ",
            TerminalTextStyle.Green,
          );
          terminal.current?.print(`Welcome, player `);
          terminal.current?.println(address, TerminalTextStyle.Text);
          terminal.current?.print(
            "Sent player $0.15 :) ",
            TerminalTextStyle.Blue,
          );
          terminal.current?.printLink(
            "(View Transaction)",
            () => {
              window.open(
                `${BLOCK_EXPLORER_URL}/tx/${registerConfirmationResponse.txHash}`,
              );
            },
            TerminalTextStyle.Blue,
          );
          terminal.current?.newline();
          setStep(TerminalPromptStep.ASKING_PLAYER_EMAIL);
        }
      } else {
        if (!ethConnection) {
          throw new Error("no eth connection");
        }
        const contractsAPI = await makeContractsAPI({
          connection: ethConnection,
          contractAddress,
          components,
        });

        const keyBigInt = bigIntFromKey(key);
        const snarkArgs = await getWhitelistArgs(keyBigInt, address, terminal);
        try {
          const getArgs = async () => {
            return [
              snarkArgs[ZKArgIdx.PROOF_A],
              snarkArgs[ZKArgIdx.PROOF_B],
              snarkArgs[ZKArgIdx.PROOF_C],
              [...snarkArgs[ZKArgIdx.DATA]],
            ];
          };

          const txIntent: UnconfirmedUseKey = {
            contract: contractsAPI.contract,
            methodName: "useKey",
            args: getArgs(),
          };

          // console.log(txIntent);
          const tx = await contractsAPI.submitTransaction(txIntent);
          console.log(tx);

          // const ukReceipt = await contractsAPI.contract.useKey(
          //   snarkArgs[ZKArgIdx.PROOF_A],
          //   snarkArgs[ZKArgIdx.PROOF_B],
          //   snarkArgs[ZKArgIdx.PROOF_C],
          //   [...snarkArgs[ZKArgIdx.DATA]]
          // );
          // await ukReceipt.wait();
          terminal.current?.print(
            "Successfully joined game. ",
            TerminalTextStyle.Green,
          );
          terminal.current?.print(`Welcome, player `);
          terminal.current?.println(address, TerminalTextStyle.Text);
          // terminal.current?.print('Sent player $0.15 :) ', TerminalTextStyle.Blue);
          // terminal.current?.printLink(
          //   '(View Transaction)',
          //   () => {
          //     window.open(`${BLOCK_EXPLORER_URL}/tx/${ukReceipt.hash}`);
          //   },
          //   TerminalTextStyle.Blue
          // );

          terminal.current?.printLink(
            "(View Transaction)",
            () => {
              window.open(`${BLOCK_EXPLORER_URL}/tx/${tx.hash}`);
            },
            TerminalTextStyle.Pink,
          );
          terminal.current?.newline();
          // setStep(TerminalPromptStep.ASKING_PLAYER_EMAIL);
          setStep(TerminalPromptStep.FETCHING_ETH_DATA);
        } catch (e) {
          const error = e as Error;
          if (error instanceof Error) {
            //NOTE: Here might be some bugs
            const invalidKey = error.message.includes("invalid key");
            if (invalidKey) {
              terminal.current?.println(
                `ERROR: Key ${key} is not valid.`,
                TerminalTextStyle.Red,
              );
              setStep(TerminalPromptStep.ASKING_WAITLIST_EMAIL);
            } else {
              terminal.current?.println(
                `ERROR: Something went wrong.`,
                TerminalTextStyle.Red,
              );
              terminal.current?.println(
                "Press [Enter] to try again.",
                TerminalTextStyle.Pink,
              );
              await terminal.current?.getInput();
              advanceStateFromAskWhitelistKey(terminal);
            }
          }
          console.error("Error whitelisting.");
        }
      }
    },
    [ethConnection, contractAddress, useZkWhitelist],
  );

  const advanceStateFromAskWaitlistEmail = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      terminal.current?.println(
        "Enter your email address to sign up for the whitelist.",
        TerminalTextStyle.Text,
      );
      const email = (await terminal.current?.getInput()) || "";
      terminal.current?.print("Response pending... ");
      const response = await submitInterestedEmail(email);
      if (response === EmailResponse.Success) {
        terminal.current?.println(
          "Email successfully recorded. ",
          TerminalTextStyle.Green,
        );
        terminal.current?.println(
          "Keep an eye out for updates and invite keys in the next few weeks. Press ENTER to return to the homepage.",
          TerminalTextStyle.Sub,
        );
        setStep(TerminalPromptStep.TERMINATED);
        (await await terminal.current?.getInput()) || "";
        navigate("/");
      } else if (response === EmailResponse.Invalid) {
        terminal.current?.println(
          "Email invalid. Please try again.",
          TerminalTextStyle.Red,
        );
      } else {
        terminal.current?.print("ERROR: Server error. ", TerminalTextStyle.Red);
        terminal.current?.print(
          "Press ENTER to return to homepage.",
          TerminalTextStyle.Sub,
        );
        (await await terminal.current?.getInput()) || "";
        setStep(TerminalPromptStep.TERMINATED);
        navigate("/");
      }
    },
    [navigate],
  );

  const advanceStateFromAskPlayerEmail = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      const address = ethConnection?.getAddress();
      if (!address) {
        throw new Error("not logged in");
      }

      terminal.current?.print(
        "Enter your email address. ",
        TerminalTextStyle.Text,
      );
      terminal.current?.println(
        "We'll use this email address to notify you if you win a prize.",
      );

      const email = (await terminal.current?.getInput()) || "";
      const response = await submitPlayerEmail(
        await ethConnection?.signMessageObject({ email }),
      );

      if (response === EmailResponse.Success) {
        terminal.current?.println("Email successfully recorded.");
        setStep(TerminalPromptStep.FETCHING_ETH_DATA);
      } else if (response === EmailResponse.Invalid) {
        terminal.current?.println("Email invalid.", TerminalTextStyle.Red);
        advanceStateFromAskPlayerEmail(terminal);
      } else {
        terminal.current?.println(
          "Error recording email.",
          TerminalTextStyle.Red,
        );
        setStep(TerminalPromptStep.FETCHING_ETH_DATA);
      }
    },
    [ethConnection],
  );

  const advanceStateFromFetchingEthData = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      let newGameManager: GameManager;

      try {
        if (!ethConnection) {
          throw new Error("no eth connection");
        }

        if (spectate && !folderSave) {
          terminal.current?.println("打开这一局的钱包目录。");
          return;
        }

        const mainAccount = folderSave
          ? (folderSave.agent.address as EthAddress)
          : ethConnection.getAddress();

        newGameManager = await GameManager.create({
          mainAccount: mainAccount,
          connection: ethConnection,
          terminal,
          contractAddress,
          components,
          spectate,
          fileSave: folderSave,
        });
      } catch (e) {
        console.error(e);

        setStep(TerminalPromptStep.ERROR);

        terminal.current?.print(
          "Network under heavy load. Please refresh the page, and check ",
          TerminalTextStyle.Red,
        );

        terminal.current?.printLink(
          BLOCK_EXPLORER_URL,
          () => {
            window.open(BLOCK_EXPLORER_URL);
          },
          TerminalTextStyle.Red,
        );

        terminal.current?.println("");

        return;
      }

      setGameManager(newGameManager);

      window.df = newGameManager;

      const newGameUIManager = await GameUIManager.create(
        newGameManager,
        terminal,
        localVoyages,
      );

      window.ui = newGameUIManager;

      terminal.current?.newline();
      terminal.current?.println("Connected to " + WORLD_NAME + " Contract");

      terminal.current?.newline();
      terminal.current?.println("Welcome to " + WORLD_NAME + ".");
      terminal.current?.newline();

      // 观战不注册玩家，也不弹出操作面板。
      if (!spectate) {
        terminal.current?.printElement(
          <RedPillRegisterPlayer ethConnection={ethConnection} />,
        );
      }

      //NOTE: round 3 don't collect those information
      // terminal.current?.println('We collect a minimal set of statistics such as SNARK proving');
      // terminal.current?.println('times and average transaction times across browsers, to help ');
      // terminal.current?.println('us optimize performance and fix bugs. You can opt out of this');
      // terminal.current?.println('in the Settings pane.');
      // terminal.current?.newline();

      gameUIManagerRef.current = newGameUIManager;
      if (!newGameManager.hasJoinedGame() && spectate === false) {
        setStep(TerminalPromptStep.NO_HOME_PLANET);
      } else {
        const browserHasData = !!newGameManager.getHomeCoords();

        if (spectate) {
          terminal.current?.println(
            "Spectate mode need to input the center coords.",
            TerminalTextStyle.Text,
          );
          setStep(TerminalPromptStep.ASK_ADD_ACCOUNT);
          return;
        }

        if (!browserHasData) {
          terminal.current?.println(
            "ERROR: Home coords not found on this browser.",
            TerminalTextStyle.Red,
          );
          setStep(TerminalPromptStep.ASK_ADD_ACCOUNT);
          return;
        }
        terminal.current?.println("Validated Local Data...");
        setStep(TerminalPromptStep.ALL_CHECKS_PASS);
      }
    },
    [
      ethConnection,
      contractAddress,
      spectate,
      folderSave,
      components,
      localVoyages,
    ],
  );

  const advanceStateFromAskAddAccount = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      if (spectate) {
        setStep(TerminalPromptStep.ADD_ACCOUNT);
        return;
      }

      terminal.current?.println(
        "Import account home coordinates? (y/n)",
        TerminalTextStyle.Text,
      );
      terminal.current?.println(
        "If you're importing an account, make sure you know what you're doing.",
      );
      const userInput = await terminal.current?.getInput();
      if (userInput === "y") {
        setStep(TerminalPromptStep.ADD_ACCOUNT);
      } else if (userInput === "n") {
        terminal.current?.println("Try using a different account and reload.");
        setStep(TerminalPromptStep.TERMINATED);
      } else {
        terminal.current?.println("Unrecognized input. Please try again.");
        advanceStateFromAskAddAccount(terminal);
      }
    },
    [spectate],
  );

  const advanceStateFromAddAccount = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      const gameUIManager = gameUIManagerRef.current;

      if (gameUIManager) {
        try {
          if (spectate) {
            // 家坐标来自钱包目录，观看页不再写一个临时坐标。
            setStep(TerminalPromptStep.ALL_CHECKS_PASS);
          } else {
            terminal.current?.println("x: ", TerminalTextStyle.Blue);
            const x = parseInt((await terminal.current?.getInput()) || "");
            terminal.current?.println("y: ", TerminalTextStyle.Blue);
            const y = parseInt((await terminal.current?.getInput()) || "");
            if (
              Number.isNaN(x) ||
              Number.isNaN(y) ||
              Math.abs(x) > 2 ** 32 ||
              Math.abs(y) > 2 ** 32
            ) {
              throw "Invalid home coordinates.";
            }
            if (await gameUIManager.addAccount({ x, y })) {
              terminal.current?.println("Successfully added account.");
              terminal.current?.println("Initializing game...");
              setStep(TerminalPromptStep.ALL_CHECKS_PASS);
            } else {
              throw "Invalid home coordinates.";
            }
          }
        } catch (e) {
          terminal.current?.println(`ERROR: ${e}`, TerminalTextStyle.Red);
          terminal.current?.println("Please try again.");
        }
      } else {
        terminal.current?.println(
          "ERROR: Game UI Manager not found. Terminating session.",
        );
        setStep(TerminalPromptStep.TERMINATED);
      }
    },
    [spectate],
  );

  const advanceStateFromNoHomePlanet = useCallback(
    async (
      terminal: React.MutableRefObject<TerminalHandle | undefined>,
      { showHelp }: TerminalStateOptions = {
        showHelp: true,
      },
    ) => {
      const gameUIManager = gameUIManagerRef.current;
      if (!gameUIManager) {
        terminal.current?.println(
          "ERROR: Game UI Manager not found. Terminating session.",
          TerminalTextStyle.Red,
        );
        setStep(TerminalPromptStep.TERMINATED);
        return;
      }

      // if (Date.now() / 1000 > gameUIManager.getEndTimeSeconds()) {
      //   terminal.current?.println(
      //     'ERROR: This game has ended. Terminating session.',
      //     TerminalTextStyle.Red
      //   );
      //   setStep(TerminalPromptStep.TERMINATED);
      //   return;
      // }

      let setX = undefined;
      let setY = undefined;

      const params = new URLSearchParams(window.location.search);
      if (params.has("searchCenter")) {
        const parts = params.get("searchCenter")?.split(",");

        if (parts) {
          setX = parseInt(parts[0], 10);
          setY = parseInt(parts[1], 10);
        }
      }

      if (setX && setY) {
        const coords = { x: setX, y: setY };
        const distFromOrigin = Math.sqrt(coords.x ** 2 + coords.y ** 2);
        terminal.current?.println(
          `Spawn coordinates: (${coords.x.toFixed(0)}, ${coords.y.toFixed(
            0,
          )}) were selected, distance from center: ${distFromOrigin.toFixed(0)}.`,
        );

        gameUIManager
          .getGameManager()
          .on(GameManagerEvent.InitializedPlayer, () => {
            setTimeout(() => {
              setMiniMapOn(false);

              terminal.current?.println("Initializing game...");
              setStep(TerminalPromptStep.ALL_CHECKS_PASS);
            });
          });

        gameUIManager
          .joinGame(
            async (e) => {
              // TODO: Handle 2min timeout error
              setMiniMapOn(false);

              console.error(e);

              terminal.current?.println("Error Joining Game:");
              terminal.current?.println(e.message, TerminalTextStyle.Red);
              terminal.current?.newline();

              console.log(e.message.slice(0, 20));

              if (e.message.slice(0, 20) === "Please enable popups") {
                terminal.current?.print(
                  "Player guide: ",
                  TerminalTextStyle.Pink,
                );

                terminal.current?.printLink(
                  "How to enable popups",
                  () => {
                    window.open(HOW_TO_ENABLE_POPUPS);
                  },
                  TerminalTextStyle.Green,
                );
                terminal.current?.println(
                  " <= New player please check this guide!!!",
                  TerminalTextStyle.Pink,
                );

                terminal.current?.println("");
              } else if (e.message === "transaction reverted") {
                terminal.current?.println(
                  "Please refresh the client, choose another area and try again.",
                  TerminalTextStyle.Pink,
                );

                terminal.current?.println("");
              }

              // terminal.current?.println(
              //   "Don't worry :-) you can get more BNB on Redstone this way 😘",
              //   TerminalTextStyle.Pink
              // );

              // terminal.current?.newline();
              // terminal.current?.printLink(
              //   'Deposit BNB to Redstone',
              //   () => {
              //     window.open(BLOCKCHAIN_BRIDGE);
              //   },
              //   TerminalTextStyle.Pink
              // );
              // terminal.current?.newline();
              // terminal.current?.newline();

              terminal.current?.println("Press [enter] to Try Again:");

              await terminal.current?.getInput();
              return true;
            },
            coords,
            spectate,
          )
          .catch((error: Error) => {
            terminal.current?.println(
              `[ERROR] An error occurred: ${error.toString().slice(0, 10000)}`,
              TerminalTextStyle.Red,
            );
            terminal.current?.println(
              "please refresh client to try again.",
              TerminalTextStyle.Pink,
            );
          });
      } else {
        if (showHelp) {
          terminal.current?.println(
            "Select home planet.",
            TerminalTextStyle.Green,
          );
          terminal.current?.print("Please ");
          terminal.current?.print("left-click", TerminalTextStyle.Pink);
          terminal.current?.print(" on ");
          terminal.current?.print(
            "blue squares on the map",
            TerminalTextStyle.Blue,
          );
          terminal.current?.println(" to select your spawn area.");
          terminal.current?.newline();
          terminal.current?.print("After selecting your spawn area, ");
          terminal.current?.print(
            "left-click the below line",
            TerminalTextStyle.Pink,
          );
          terminal.current?.println(", then press [enter].");
        }

        setMiniMapOn(true);
        // let the miniMap component mount
        await new Promise((resolve) => setTimeout(resolve, 100));

        const userInput = ((await terminal.current?.getInput()) ?? "").trim();
        const selectedSpawnArea = miniMapRef.current?.getSelectedSpawnArea();
        switch (true) {
          case userInput === "clear": {
            terminal.current?.clear();
            advanceStateFromNoHomePlanet(terminal, { showHelp: false });
            return;
          }
          case userInput === "h" || userInput === "help": {
            advanceStateFromNoHomePlanet(terminal, { showHelp: true });
            return;
          }
          case userInput !== "": {
            terminal.current?.println(
              "Invalid option, please try press [help]",
              TerminalTextStyle.Pink,
            );
            advanceStateFromNoHomePlanet(terminal, { showHelp: false });
            return;
          }
        }

        if (!selectedSpawnArea) {
          terminal.current?.println(
            "Please select a spawn area, then press [enter]",
            TerminalTextStyle.Red,
          );

          advanceStateFromNoHomePlanet(terminal, { showHelp: false });
          return;
        }

        // disable reselect of spawn posistion when we start searching
        miniMapRef.current?.setSelectable(false);

        const coords = selectedSpawnArea.worldPoint;
        const distFromOrigin = Math.sqrt(coords.x ** 2 + coords.y ** 2);
        terminal.current?.println(
          `Spawn coordinates: (${coords.x.toFixed(0)}, ${coords.y.toFixed(
            0,
          )}) were selected, distance from center: ${distFromOrigin.toFixed(0)}.`,
        );

        gameUIManager
          .getGameManager()
          .on(GameManagerEvent.InitializedPlayer, () => {
            setTimeout(() => {
              setMiniMapOn(false);

              terminal.current?.println("Initializing game...");
              setStep(TerminalPromptStep.ALL_CHECKS_PASS);
            });
          });

        gameUIManager
          .joinGame(
            async (e) => {
              // TODO: Handle 2min timeout error
              setMiniMapOn(false);

              console.error(e);

              terminal.current?.println("Error Joining Game:");
              terminal.current?.println(e.message, TerminalTextStyle.Red);
              terminal.current?.newline();

              console.log(e.message.slice(0, 20));

              if (e.message.slice(0, 20) === "Please enable popups") {
                terminal.current?.print(
                  "Player guide: ",
                  TerminalTextStyle.Pink,
                );

                terminal.current?.printLink(
                  "How to enable popups",
                  () => {
                    window.open(HOW_TO_ENABLE_POPUPS);
                  },
                  TerminalTextStyle.Green,
                );
                terminal.current?.println(
                  " <= New player please check this guide!!!",
                  TerminalTextStyle.Pink,
                );

                terminal.current?.println("");
              } else if (e.message === "transaction reverted") {
                terminal.current?.println(
                  "Please refresh the client, choose another area and try again.",
                  TerminalTextStyle.Pink,
                );

                terminal.current?.println("");
              }

              // terminal.current?.println(
              //   "Don't worry :-) you can get more BNB on Redstone this way 😘",
              //   TerminalTextStyle.Pink
              // );

              // terminal.current?.newline();
              // terminal.current?.printLink(
              //   'Deposit BNB to Redstone',
              //   () => {
              //     window.open(BLOCKCHAIN_BRIDGE);
              //   },
              //   TerminalTextStyle.Pink
              // );
              // terminal.current?.newline();
              // terminal.current?.newline();

              terminal.current?.println("Press [enter] to Try Again:");

              await terminal.current?.getInput();
              return true;
            },
            coords,
            spectate,
          )
          .catch((error: Error) => {
            terminal.current?.println(
              `[ERROR] An error occurred: ${error.toString().slice(0, 10000)}`,
              TerminalTextStyle.Red,
            );
            terminal.current?.println(
              "please refresh client to try again.",
              TerminalTextStyle.Pink,
            );
          });
      }
    },
    [ethConnection, spectate],
  );

  const advanceStateFromAllChecksPass = useCallback(
    async (
      terminal: React.MutableRefObject<TerminalHandle | undefined>,
      showHelp = true,
    ) => {
      // 观战不再等玩家按回车，进图后关掉终端。
      if (spectate) {
        setStep(TerminalPromptStep.COMPLETE);
        setInitRenderState(InitRenderState.COMPLETE);
        setTerminalVisible(false);
        terminal.current?.clear();
        return;
      }

      if (showHelp) {
        terminal.current?.println("Enter game.", TerminalTextStyle.Green);
        terminal.current?.println("Press [enter] to begin");
        terminal.current?.println(
          "Press [s] then [enter] to begin in SAFE MODE - plugins disabled",
        );
      }

      const input = (await terminal.current?.getInput())?.trim() ?? "";
      switch (true) {
        // set safe mode
        case input === "s": {
          const gameUIManager = gameUIManagerRef.current;
          gameUIManager?.getGameManager()?.setSafeMode(true);
          break;
        }

        // recursive advance
        case input === "h" || input === "help": {
          advanceStateFromAllChecksPass(terminal, true);
          return;
        }
        case input === "clear": {
          terminal.current?.clear();
          advanceStateFromAllChecksPass(terminal, false);
          return;
        }
        case input !== "": {
          terminal.current?.println(
            "Invalid option, please try again...",
            TerminalTextStyle.Red,
          );
          advanceStateFromAllChecksPass(terminal, false);
          return;
        }
      }

      setStep(TerminalPromptStep.COMPLETE);
      setInitRenderState(InitRenderState.COMPLETE);
      terminal.current?.clear();

      terminal.current?.println(
        "Welcome to the " + WORLD_NAME + ".",
        TerminalTextStyle.Green,
      );
      terminal.current?.println("");
      terminal.current?.println(
        "This is the Dark Forest interactive JavaScript terminal. Only use this if you know exactly what you're doing.",
      );
      terminal.current?.println("");
      terminal.current?.println("Try running: df.getAccount()");
      terminal.current?.println("");
    },
    [spectate],
  );

  const advanceStateFromComplete = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      const session = sessionRef.current;
      const input = (await terminal.current?.getInput()) || "";
      if (session !== sessionRef.current) {
        return;
      }
      let res = "";
      try {
        // indrect eval call: http://perfectionkills.com/global-eval-what-are-the-options/
        res = (1, eval)(input);
        if (res !== undefined) {
          terminal.current?.println(res.toString(), TerminalTextStyle.Text);
        }
      } catch (e) {
        res = (e as Error).message;
        terminal.current?.println(`ERROR: ${res}`, TerminalTextStyle.Red);
      }
      if (session !== sessionRef.current) {
        return;
      }
      advanceStateFromComplete(terminal);
    },
    [],
  );

  const advanceStateFromError = useCallback(async () => {
    await neverResolves();
  }, []);

  const advanceStateFromSpectating = useCallback(
    async (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      try {
        if (!ethConnection) {
          throw new Error("not logged in");
        }

        setSpectate(true);
        setMiniMapOn(false);
        console.log("specatate:", spectate);
        console.log("isMiniMapOn:", isMiniMapOn);

        setStep(TerminalPromptStep.FETCHING_ETH_DATA);
      } catch (e) {
        console.error(e);
        setStep(TerminalPromptStep.ERROR);
        terminal.current?.print(
          "Network under heavy load. Please refresh the page, and check ",
          TerminalTextStyle.Red,
        );
        terminal.current?.printLink(
          BLOCK_EXPLORER_URL,
          () => {
            window.open(BLOCK_EXPLORER_URL);
          },
          TerminalTextStyle.Red,
        );
        terminal.current?.println("");
        return;
      }
    },
    [ethConnection, isProd, contractAddress, spectate],
  );

  const advanceState = useCallback(
    (terminal: React.MutableRefObject<TerminalHandle | undefined>) => {
      if (browserCompatibleState !== "supported") {
        return;
      }
      if (ethConnection === undefined) {
        return;
      }

      switch (true) {
        case step === TerminalPromptStep.COMPATIBILITY_CHECKS_PASSED:
          advanceStateFromCompatibilityPassed(terminal);
          return;
        case step === TerminalPromptStep.DISPLAY_ACCOUNTS:
          advanceStateFromDisplayAccounts(terminal);
          return;
        case step === TerminalPromptStep.GENERATE_ACCOUNT:
          advanceStateFromGenerateAccount(terminal);
          return;
        case step === TerminalPromptStep.IMPORT_ACCOUNT:
          advanceStateFromImportAccount(terminal);
          return;
        case step === TerminalPromptStep.ACCOUNT_SET:
          advanceStateFromAccountSet(terminal);
          return;
        case step === TerminalPromptStep.ASKING_HAS_WHITELIST_KEY:
          advanceStateFromAskHasWhitelistKey(terminal);
          return;
        case step === TerminalPromptStep.ASKING_WHITELIST_KEY:
          advanceStateFromAskWhitelistKey(terminal);
          return;
        case step === TerminalPromptStep.ASKING_WAITLIST_EMAIL:
          advanceStateFromAskWaitlistEmail(terminal);
          return;
        case step === TerminalPromptStep.ASKING_PLAYER_EMAIL:
          advanceStateFromAskPlayerEmail(terminal);
          return;
        case step === TerminalPromptStep.FETCHING_ETH_DATA:
          advanceStateFromFetchingEthData(terminal);
          return;
        case step === TerminalPromptStep.ASK_ADD_ACCOUNT:
          advanceStateFromAskAddAccount(terminal);
          return;
        case step === TerminalPromptStep.ADD_ACCOUNT:
          advanceStateFromAddAccount(terminal);
          return;
        case step === TerminalPromptStep.NO_HOME_PLANET:
          advanceStateFromNoHomePlanet(terminal);
          return;
        case step === TerminalPromptStep.ALL_CHECKS_PASS:
          advanceStateFromAllChecksPass(terminal);
          return;
        case step === TerminalPromptStep.COMPLETE:
          advanceStateFromComplete(terminal);
          return;
        case step === TerminalPromptStep.ERROR:
          advanceStateFromError();
          return;
        case step === TerminalPromptStep.SPECTATING:
          advanceStateFromSpectating(terminal);
          return;
      }
    },
    [
      step,
      advanceStateFromAccountSet,
      advanceStateFromAddAccount,
      advanceStateFromAllChecksPass,
      advanceStateFromAskAddAccount,
      advanceStateFromAskHasWhitelistKey,
      advanceStateFromAskPlayerEmail,
      advanceStateFromAskWaitlistEmail,
      advanceStateFromAskWhitelistKey,
      advanceStateFromCompatibilityPassed,
      advanceStateFromComplete,
      advanceStateFromDisplayAccounts,
      advanceStateFromError,
      advanceStateFromFetchingEthData,
      advanceStateFromGenerateAccount,
      advanceStateFromImportAccount,
      advanceStateFromNoHomePlanet,
      advanceStateFromSpectating,
      ethConnection,
      browserCompatibleState,
      syncSign,
    ],
  );

  useEffect(() => {
    const uiEmitter = UIEmitter.getInstance();
    uiEmitter.emit(UIEmitterEvent.UIChange);
  }, [initRenderState]);

  useEffect(() => {
    const gameUiManager = gameUIManagerRef.current;
    if (!terminalVisible && gameUiManager) {
      const tutorialManager = TutorialManager.getInstance(gameUiManager);
      tutorialManager.acceptInput(TutorialState.Terminal);
    }
  }, [terminalVisible]);

  useEffect(() => {
    if (terminalHandle.current && topLevelContainer.current) {
      advanceState(terminalHandle);
    }
  }, [terminalHandle, topLevelContainer, advanceState]);

  useEffect(() => {
    let stopped = false;
    loadWalletDirectory()
      .then(async (handle) => {
        if (stopped || !handle) {
          return;
        }
        const permission = await directoryPermission(handle, false);
        if (stopped) {
          return;
        }
        if (permission !== "granted") {
          setFolderCard({ folderName: handle.name });
          return;
        }
        grantedFolderRef.current = handle;
        setFolderCard(await readFolderCard(handle));
      })
      .catch((error) => console.error(error));
    return () => {
      stopped = true;
    };
  }, []);

  useEffect(() => {
    const handle = folderHandleRef.current;
    if (!handle || watchToken === 0) return;
    const cursor = boardCursorRef.current;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstRead = true;
    const pending: ActionRecord[] = [];

    const read = async () => {
      try {
        const actions = await readWalletActions(handle, cursor);
        if (stopped) return;
        if (actions.length > 0)
          setActionLog((current) => [...current, ...actions]);
        if (!firstRead) pending.push(...actions);
        firstRead = false;
        const manager = gameUIManagerRef.current;
        if (manager) {
          for (const action of pending.splice(0)) {
            localVoyages.add(
              action,
              manager,
              components.getChainClockOffsetMs(),
            );
          }
        }
      } catch (error) {
        console.error("Unable to load local actions", error);
      } finally {
        if (!stopped) timer = setTimeout(() => void read(), 1000);
      }
    };
    void read();
    return () => {
      stopped = true;
      clearTimeout(timer);
      localVoyages.clearPreviews();
    };
  }, [watchToken, localVoyages, components]);

  useEffect(() => {
    const handle = folderHandleRef.current;
    if (!handle || watchToken === 0) {
      return;
    }
    let stopped = false;
    let centeredOnHome = false;

    const watch = async () => {
      while (!stopped) {
        try {
          const { chunks, replace, homeText } = await readWalletTail(
            handle,
            boardCursorRef.current,
          );
          if (stopped) {
            return;
          }
          const manager = gameManagerRef.current;
          if (manager) {
            if (replace) {
              manager.replaceWatchedChunks(chunks.map(toExploredChunk));
            } else {
              for (const chunk of chunks) {
                manager.ingestWatchedChunk(toExploredChunk(chunk));
              }
            }
            const home = readWatchedHome(homeText);
            if (home && !manager.getHomeCoords()) {
              manager.adoptWatchedHome(home);
            }
            if (home) {
              setHomeReady(true);
            }
            // 家的文件可能比画面晚到。没有上次镜头时，下一轮再移到家。
            if (home && !centeredOnHome) {
              try {
                const viewport = Viewport.getInstance();
                if (!viewport.getStorage()) {
                  viewport.focus(home.coords, 96);
                }
                centeredOnHome = true;
              } catch {
                // Viewport 尚未初始化。
              }
            }
          }
        } catch (error) {
          console.error(error);
        }
        // 等这一帧画完再读下一轮。没有新字节时也不会空等 1 秒。
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      }
    };
    void watch();
    return () => {
      stopped = true;
    };
  }, [watchToken]);

  useEffect(() => {
    if (
      gameManager &&
      folderLoad.kind === "busy" &&
      folderLoad.label === "正在进入游戏"
    ) {
      setFolderLoad({ kind: "idle" });
    }
  }, [gameManager, folderLoad]);

  if (!syncSign && gameManager) {
    return (
      <LoadingContent>
        <Spinner />
        <LoadingText>
          Step: {syncProgress.step}
          <br />
          Progress: {syncProgress.percentage.toFixed()}%
        </LoadingText>
        <LoadingNote>
          Please wait while the indexer syncs...
          <br />
          This may take a few minutes
        </LoadingNote>
      </LoadingContent>
    );
  }

  function returnToHome() {
    gateSeededRef.current = false;
    folderHandleRef.current = undefined;
    boardCursorRef.current = {
      offset: 0,
      homeModified: 0,
      homeSize: 0,
      actionsOffset: 0,
      priceModified: 0,
      priceSize: 0,
    };
    setActionLog([]);
    setWatchToken(0);
    setFolderSave(undefined);
    setHomeReady(false);
    setFolderLoad({ kind: "idle" });
  }

  function leaveGame() {
    sessionRef.current += 1;
    try {
      gameUIManagerRef.current?.destroy();
    } catch (error) {
      console.error(error);
    }
    gameUIManagerRef.current = null;
    window.df = undefined;
    window.ui = undefined;
    setGameManager(undefined);
    setInitRenderState(InitRenderState.NONE);
    setTerminalVisible(false);
    setStep(TerminalPromptStep.SPECTATING);
    returnToHome();
  }

  async function openWalletFolder(forcePick: boolean) {
    const picker = (
      window as Window & {
        showDirectoryPicker?: (options: {
          mode: "read";
        }) => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker;
    try {
      // 选目录必须发生在第一次 await 之前，否则浏览器会丢掉这次点击。
      let handle = !forcePick ? grantedFolderRef.current : undefined;
      if (!handle) {
        if (!picker) {
          setImportNotice("这个浏览器没有目录选择窗口。");
          return;
        }
        handle = await picker({ mode: "read" });
      }
      setImporting(true);
      setImportNotice(undefined);
      const network = getNetworkConfig();
      const result = await loadSelectedGame(handle, network, () => undefined);
      if (!result.ok) {
        const sentence =
          result.reason === "ended"
            ? `${result.title}，${result.detail}`
            : `${result.title}。${result.detail}`;
        setImportNotice(sentence);
        return;
      }
      setImportNotice(undefined);
      grantedFolderRef.current = result.directory;
      await saveWalletDirectory(result.directory);
      setFolderCard(await readFolderCard(result.directory));
      gateSeededRef.current = true;
      folderHandleRef.current = result.directory;
      boardCursorRef.current = {
        offset: result.boardOffset,
        homeModified: 0,
        homeSize: 0,
        actionsOffset: 0,
        priceModified: 0,
        priceSize: 0,
      };
      setActionLog([]);
      setHomeReady(result.homeReady);
      setFolderSave(result.save);
      setWatchToken((token) => token + 1);
      setFolderLoad({
        kind: "busy",
        done: 1,
        total: 1,
        label: "正在进入游戏",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error(error);
      setImportNotice(
        error instanceof Error
          ? `无法打开目录。${error.message}`
          : "无法打开目录。请再选一次钱包目录。",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <Wrapper initRender={initRenderState} terminalEnabled={terminalVisible}>
        {folderLoad.kind !== "idle" && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0, 0, 0, 0.86)",
              color: "#d7ffe4",
              fontFamily: "'Start Press 2P', sans-serif",
            }}
          >
            <div style={{ maxWidth: 560, lineHeight: 1.8, fontSize: 12 }}>
              {folderLoad.kind === "busy" ? (
                <>
                  <div>{folderLoad.label}</div>
                  <div>
                    {folderLoad.total > 0
                      ? `${folderLoad.done} / ${folderLoad.total}`
                      : "请稍候"}
                  </div>
                </>
              ) : (
                <>
                  <div>{folderLoad.title}</div>
                  <div style={{ marginTop: 12 }}>{folderLoad.detail}</div>
                  <button
                    type="button"
                    style={{ marginTop: 18 }}
                    onClick={returnToHome}
                  >
                    回到首页
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {!gameManager && (
          <HomeLobby
            card={folderCard}
            assets={homeAssets}
            notice={importNotice}
            importing={importing}
            syncing={!syncSign}
            onImport={() => {
              void openWalletFolder(false);
            }}
            onChangeFolder={() => {
              void openWalletFolder(true);
            }}
          />
        )}
        <GameWindowWrapper
          initRender={initRenderState}
          terminalEnabled={terminalVisible}
        >
          {gameUIManagerRef.current &&
            topLevelContainer.current &&
            gameManager && (
              <TopLevelDivProvider value={topLevelContainer.current}>
                <UIManagerProvider value={gameUIManagerRef.current}>
                  <GameWindowLayout
                    terminalVisible={terminalVisible}
                    setTerminalVisible={setTerminalVisible}
                    spectate={spectate}
                    showPublicStatus={spectate}
                    homeReady={homeReady}
                    guideWallet={
                      initRenderState === InitRenderState.COMPLETE &&
                      folderLoad.kind === "idle"
                        ? folderSave?.agent.address
                        : undefined
                    }
                    actions={actionLog}
                    onReturnHome={spectate ? leaveGame : undefined}
                  />
                </UIManagerProvider>
              </TopLevelDivProvider>
            )}

          {!spectate && (
            <TerminalToggler
              terminalEnabled={terminalVisible}
              setTerminalEnabled={setTerminalVisible}
            />
          )}
        </GameWindowWrapper>

        <div style={{ display: gameManager ? "contents" : "none" }}>
          <TerminalWrapper
            initRender={initRenderState}
            terminalEnabled={terminalVisible}
          >
            <MythicLabelText
              text={`Welcome To ${WORLD_NAME} ${VERSION} `}
              style={{
                fontFamily: "'Start Press 2P', sans-serif",
                display:
                  initRenderState !== InitRenderState.COMPLETE
                    ? "block"
                    : "none",
              }}
            />
            <div>
              step: {syncProgress.step} percent: {syncProgress.percentage} %
            </div>

            <BrowserIssues
              issues={browserIssues}
              state={browserCompatibleState}
            />
            <Terminal
              ref={terminalHandle}
              promptCharacter={">"}
              visible={browserCompatibleState === "supported"}
              useCaretElement={initRenderState !== InitRenderState.COMPLETE}
            />
          </TerminalWrapper>
        </div>

        <div ref={topLevelContainer}></div>
        <div>
          {isMiniMapOn && (
            <div style={{ position: "fixed", right: "100px", top: "100px" }}>
              <MiniMap ref={miniMapRef} />
            </div>
          )}
        </div>
      </Wrapper>
    </>
  );
}
