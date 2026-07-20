import { Router } from "express";
import { ChannelService } from "../services/channelService";

const router = Router();
const channelService = new ChannelService();

// GET /api/channels
router.get("/", async (_req, res) => {
  try {
    const channels = await channelService.list();
    res.json(channels);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({
      error: err.message || "Failed to load channels",
    });
  }
});

// POST /api/channels
router.post("/", async (req, res) => {
  try {
    const { username } = req.body;

    const channel = await channelService.add(username);

    res.status(201).json(channel);
  } catch (err: any) {
    console.error(err);

    res.status(400).json({
      error: err.message,
    });
  }
});

// DELETE /api/channels/:username
router.delete("/:username", async (req, res) => {
  try {
    await channelService.remove(req.params.username);

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