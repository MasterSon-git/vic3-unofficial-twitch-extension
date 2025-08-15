export type Vic3Broadcast =
  | { type: "vic3:snapshot"; payload: any };

// In the panel, check message.type === "vic3:snapshot"
