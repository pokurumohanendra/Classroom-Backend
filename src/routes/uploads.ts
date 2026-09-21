import express from "express";
import { v2 as cloudinary } from "cloudinary";
import { requireAuth } from "../middleware/require-auth";

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  throw new Error('CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must be set in .env file');
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const router = express.Router();

router.post("/delete", requireAuth, async (req, res) => {
  const { publicId } = req.body as { publicId?: string };

  if (!publicId) {
    return res.status(400).json({ error: "publicId is required" });
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);

    if (result.result !== "ok" && result.result !== "not found") {
      return res.status(502).json({ error: "Cloudinary refused to delete the image" });
    }

    res.json({ message: "Image deleted", result: result.result });
  } catch (err) {
    res.status(500).json({ error: "Error occurred while deleting the image" });
  }
});

export default router;
