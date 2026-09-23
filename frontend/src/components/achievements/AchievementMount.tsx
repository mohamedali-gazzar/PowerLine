import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import MilestoneModal from "./MilestoneModal";
import { milestoneByCount, type Milestone } from "./milestones";
import { useMilestoneCheck } from "./useMilestoneCheck";

/**
 * Mounted once in the app layout so the milestone popup can overlay any screen. It shows either the
 * highest milestone the user has genuinely reached-but-not-seen (from useMilestoneCheck), or a
 * dev-only preview opened with ?milestone=10 in the URL (for testing / replay).
 */
export default function AchievementMount() {
  const reached = useMilestoneCheck();
  const [devMilestone, setDevMilestone] = useState<Milestone | null>(null);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  // Dev-only: ?milestone=10 opens the popup. Stripping the param on close means re-adding it replays.
  useEffect(() => {
    const n = Number(new URLSearchParams(search).get("milestone"));
    if (n) setDevMilestone(milestoneByCount(n) ?? null);
  }, [search]);

  const milestone = devMilestone ?? reached?.milestone ?? null;
  if (!milestone) return null;

  const onClose = () => {
    if (devMilestone) {
      setDevMilestone(null);
      const p = new URLSearchParams(search); p.delete("milestone");
      navigate({ pathname, search: p.toString() }, { replace: true });
    } else {
      reached?.markSeen();
    }
  };

  return createPortal(
    <MilestoneModal key={milestone.count} milestone={milestone} onClose={onClose} />,
    document.body,
  );
}
