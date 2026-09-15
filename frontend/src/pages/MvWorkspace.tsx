import { Navigate, useParams } from "react-router-dom";

/**
 * MV quotations now open in the shared LV workspace (same header bar and full approval flow) —
 * they are LV-kind quotations tagged "mv", distinguished only by the "MV" badge in Offer History.
 * This keeps any old /mv or /mv/:id link working by bouncing it to that workspace.
 */
export default function MvWorkspace() {
  const { id } = useParams();
  return <Navigate to={id ? `/lv/qtn/${id}` : "/lv"} replace />;
}
