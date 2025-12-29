import mongoose, { Schema, models } from "mongoose";

const TicketSchema = new Schema(
  {
    // GitHub identifiers
    githubIssueId: { type: String, required: true, unique: true },
    issueNumber: { type: Number, required: true },

    // Repository info (VERY IMPORTANT)
    repository: {
      type: String, // owner/repo
      required: true,
      index: true,
    },

    // Issue content
    title: { type: String, required: true },
    description: { type: String },

    // Metadata
    author: { type: String },
    issueUrl: { type: String },
    labels: [{ type: String }],

    // AI-related fields
    type: {
      type: String,
      enum: ["bug", "feature", "question", "unknown"],
      default: "unknown",
    },
    status: {
      type: String,
      enum: ["open", "solved"],
      default: "open",
    },
  },
  { timestamps: true }
);

export const Ticket =
  models.Ticket || mongoose.model("Ticket", TicketSchema);
