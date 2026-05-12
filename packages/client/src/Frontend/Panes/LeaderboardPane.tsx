import { ModalName } from "@df/types";

import { LeadboardDisplay } from "../Views/Leaderboard";
import { ModalPane } from "../Views/ModalPane";

export function LeaderboardPane({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <ModalPane
      id={ModalName.Leaderboard}
      title="Leaderboard"
      visible={visible}
      onClose={onClose}
    >
      <LeadboardDisplay />
    </ModalPane>
  );
}
