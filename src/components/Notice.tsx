export const Notice = ({ message }: { message: string | null }) => (
  <div id="notice" className="notice" role="status" hidden={message === null}>{message ?? ''}</div>
);
