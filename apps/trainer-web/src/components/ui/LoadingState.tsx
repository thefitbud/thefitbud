export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="ui-card ui-loading" role="status" aria-label={label}>
      <div className="ui-skel" style={{ height: 14, width: "60%" }} />
      <div className="ui-skel" style={{ height: 10, width: "90%" }} />
      <div className="ui-skel" style={{ height: 10, width: "75%" }} />
      <div className="ui-skel" style={{ height: 40, width: "100%", marginTop: 8 }} />
    </div>
  );
}
