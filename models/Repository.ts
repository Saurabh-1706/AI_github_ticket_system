import { Schema, model, models } from "mongoose";

const RepositorySchema = new Schema(
  {
    name: { type: String, required: true }, // repo name
    fullName: { type: String, required: true, unique: true }, // owner/repo
    owner: { type: String, required: true },
    description: String,
    githubRepoId: { type: Number, required: true },
  },
  { timestamps: true }
);

export const Repository =
  models.Repository || model("Repository", RepositorySchema);
