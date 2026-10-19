/** What an AI section shows while no model is connected. */
export function AiNotConnected() {
  return (
    <>
      <span className="text-[13px] font-semibold text-fg-muted">Not connected</span>
      <p className="m-0 text-[13px] leading-normal text-fg-muted">
        No model rates cases (ADR-0032). An AI summary for the reviewer will appear here.
      </p>
    </>
  );
}
