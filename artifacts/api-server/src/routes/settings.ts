import { Router, type IRouter } from "express";

const router: IRouter = Router();

export const APPLICATION_VERSION = "v0.1.9";

const SETTINGS = {
  departments: [
    "Operations",
    "Finance",
    "Customer Service",
    "Information Technology",
    "Compliance",
    "Human Resources",
    "Sales",
  ],
  categories: [
    "Revenue Growth",
    "Operational Efficiency",
    "Customer Experience",
    "Internal Productivity",
    "Compliance and Security",
    "Experimental",
  ],
  statuses: [
    "Idea",
    "Review",
    "Approved",
    "Prototype",
    "Pilot",
    "Production",
    "Closed",
    "Declined",
  ],
  scoringWeights: [
    { name: "Business Value", weight: 25 },
    { name: "Revenue Potential", weight: 15 },
    { name: "Cost Savings", weight: 15 },
    { name: "Customer Impact", weight: 15 },
    { name: "Strategic Alignment", weight: 10 },
    { name: "AI Readiness", weight: 10 },
    { name: "Prototype Confidence", weight: 10 },
    { name: "Technical Complexity Penalty", weight: -10 },
    { name: "Risk Penalty", weight: -10 },
  ],
  applicationVersion: APPLICATION_VERSION,
};

router.get("/settings", (_req, res) => {
  res.json(SETTINGS);
});

export default router;
