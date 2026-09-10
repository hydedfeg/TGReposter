// Each callback belongs to the session in which it was created. Invalidating a
// session also invalidates callbacks waiting on response bodies or child AI work.
export class WorkspaceSession {
  private revision = 0;

  invalidate() {
    this.revision++;
  }

  capture(token: string | null = localStorage.getItem("curator_token")) {
    const revision = this.revision;
    return () => this.revision === revision &&
      localStorage.getItem("curator_token") === token;
  }
}
