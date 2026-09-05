import { Router } from "express";
import { ChannelService } from "../services/channelService";

const router = Router();
const channelService = new ChannelService();

// GET /api/channels
router.get("/", async (req: any, res) => {
  try {
    const channels = await channelService.list(req.user);
    res.json(channels);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({
      error: err.message || "Failed to load channels",
    });
  }
});

// POST /api/channels
router.post("/", async (req: any, res) => {
  try {
    const { username } = req.body;

    const channel = await channelService.add(req.user, username);

    res.status(201).json(channel);
  } catch (err: any) {
    console.error(err);

    res.status(400).json({
      error: err.message,
    });
  }
});

// DELETE /api/channels/:username
router.delete("/:username", async (req: any, res) => {
  try {
    await channelService.remove(req.user, req.params.username);

    res.json({
      success: true,
    });
  } catch (err: any) {
    console.error(err);

    res.status(400).json({
      error: err.message,
    });
  }
});

export default router;
