import { Router, type IRouter } from "express";

const router: IRouter = Router();

const DOCUMENTS = [
  { id: 1, title: "Matrix Innovation Hub Charter" },
  { id: 2, title: "AI Opportunity Playbook" },
  { id: 3, title: "AI Innovation Office Operating Manual" },
  { id: 4, title: "AI Project Lifecycle" },
  { id: 5, title: "Innovation Scoring and Prioritization Guide" },
  { id: 6, title: "Functional Specification" },
].map((doc) => ({
  ...doc,
  version: "v1.0",
  owner: "CIO / AI Innovation Office",
  status: "Not Published",
}));

router.get("/documents", (_req, res) => {
  res.json(DOCUMENTS);
});

export default router;
