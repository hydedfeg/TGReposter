import { Router } from "express";
import { ownerPrincipalForUser } from "../services/userPrincipalService";
import { userWorkspaceRepository } from "../services/userWorkspaceService";

const router = Router();

function cleanUsername(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/^@/, "").toLowerCase()
    : "";
}

// These routes are tenant-scoped. authMiddleware is mounted by server.ts.
router.get("/", async (req: any, res) => {
  try {
    const owner = ownerPrincipalForUser(req.user);
    const workspace = await userWorkspaceRepository.getConfig(owner);
    res.json(workspace.channels);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({
      error: error?.message || "Failed to load your source channels.",
    });
  }
});

router.post("/", async (req: any, res) => {
  try {
    const owner = ownerPrincipalForUser(req.user);
    const username = cleanUsername(req.body?.username);
    if (!username) {
      return res.status(400).json({ error: "Channel username is required." });
    }

    const workspace = await userWorkspaceRepository.getConfig(owner);
    if (workspace.channels.some(channel => channel.username === username)) {
      return res.status(409).json({ error: "Channel already exists in your workspace." });
    }

    const channels = await userWorkspaceRepository.replaceChannels(owner, [
      ...workspace.channels,
      { username, enabled: true, status: "idle" },
    ]);

    res.status(201).json(
      channels.find(channel => channel.username === username)
    );
  } catch (error: any) {
    console.error(error);
    res.status(400).json({
      error: error?.message || "Failed to add source channel.",
    });
  }
});

router.delete("/:username", async (req: any, res) => {
  try {
    const owner = ownerPrincipalForUser(req.user);
    const username = cleanUsername(req.params.username);
    const workspace = await userWorkspaceRepository.getConfig(owner);
    const channels = workspace.channels.filter(
      channel => channel.username !== username
    );
    await userWorkspaceRepository.replaceChannels(owner, channels);
    res.json({ success: true });
  } catch (error: any) {
    console.error(error);
    res.status(400).json({
      error: error?.message || "Failed to remove source channel.",
    });
  }
});

export default router;
