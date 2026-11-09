import "./index.css";
import "./Frontend/Styles/font/stylesheet.css";
import "./Frontend/Styles/icomoon/style.css";
import "./Frontend/Styles/preflight.css";
import "./Frontend/Styles/Press_Start_2P/stylesheet.css";
import "./Frontend/Styles/style.css";

// import { GameLandingPage_v1 } from "@frontend/Pages/GameLandingPage_v1";
import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
import { createGlobalStyle } from "styled-components";

import { Theme } from "./Frontend/Components/Theme";
// import { GameLandingPage } from "./Frontend/Pages/GameLandingPage";
// import { GamePage } from "./Frontend/Pages/GamePage";
// import { HelloPage } from "./Frontend/Pages/HelloPage";
// import { ClassicLandingPage } from "./Frontend/Pages/LandingPage";
import { NotFoundPage } from "./Frontend/Pages/NotFoundPage";
import { DocsPage } from "./Frontend/Pages/docs/DocsPage";
import { RedPillLandingPage } from "./Frontend/Pages/RedPillLandingPage";
// import { SandboxPage } from "./Frontend/Pages/SandboxPage";
import { TxConfirmPopup } from "./Frontend/Pages/TxConfirmPopup";
// import { WelcomePage } from "./Frontend/Pages/WelcomePage";
import dfstyles from "./Frontend/Styles/dfstyles";
import { getNetworkConfig } from "./mud/getNetworkConfig";
import { PlanetTestPage } from "./PlanetTest/PlanetTestPage";

// 启动页不再提供 Red / Blue 选择。所有入口都进入 Red Pill 终端登录。
function RedirectToRedPill() {
  const { contract } = useParams();
  const worldAddress = contract || getNetworkConfig().worldAddress;

  return <Navigate to={`/redpill/${worldAddress}`} replace />;
}
const GlobalStyle = createGlobalStyle`
body {
  width: 100vw;
  min-height: 100vh;
  background-color: ${dfstyles.colors.background};
}
`;

export const App = () => {
  const networkConfig = getNetworkConfig();
  const defaultAddress = networkConfig.worldAddress;

  return (
    <>
      <GlobalStyle />
      <Theme color="dark" scale="medium">
        <Router>
          <Routes>
            {/* <Route
              path="/play_v1/"
              element={
                <Navigate to={`/play/${defaultAddress}`} replace={true} />
              }
            />
            <Route path="/play_v1/:contract" element={<GameLandingPage_v1 />} /> */}
            <Route path="/" element={<RedirectToRedPill />} />
            <Route path="/play" element={<RedirectToRedPill />} />
            <Route path="/play/:contract" element={<RedirectToRedPill />} />
            <Route path="/bluepill" element={<RedirectToRedPill />} />
            <Route path="/bluepill/:contract" element={<RedirectToRedPill />} />

            <Route
              path="/redpill"
              element={
                <Navigate to={`/redpill/${defaultAddress}`} replace={true} />
              }
            />
            <Route path="/redpill/:contract" element={<RedPillLandingPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/docs/:section" element={<DocsPage />} />
            {/* <Route path="/sandbox" element={<SandboxPage />} /> */}
            {/* <Route path="/welcome" element={<WelcomePage />} /> */}
            {/* <Route path="/game" element={<GamePage />} /> */}
            <Route path="/test" element={<PlanetTestPage />} />
            {/* <Route path="/hello" element={<HelloPage />} /> */}
            <Route path="*" element={<NotFoundPage />} />
            <Route
              path="/wallet/:contract/:addr/:actionId/:balance/:method"
              element={<TxConfirmPopup />}
            />
          </Routes>
        </Router>
      </Theme>
    </>
  );
};
