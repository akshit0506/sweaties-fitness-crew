import {
  getCurrentPeriodId,
  getLoggedAtByAthlete,
} from "@/lib/data/leaderboard";
import { BoardView } from "@/components/board/BoardView";
import { buildPeriods } from "@/lib/periods";

export default async function BoardPage() {
  const [currentPeriodId, loggedAtByAthlete] = await Promise.all([
    getCurrentPeriodId(),
    getLoggedAtByAthlete(),
  ]);

  return (
    <BoardView
      periods={buildPeriods(new Date())}
      currentPeriodId={currentPeriodId}
      loggedAtByAthlete={loggedAtByAthlete}
    />
  );
}
