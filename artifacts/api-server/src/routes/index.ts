import { Router, type IRouter } from "express";
import healthRouter from "./health";
import initiativesRouter from "./initiatives";
import dashboardRouter from "./dashboard";
import documentsRouter from "./documents";
import settingsRouter from "./settings";
import validationsRouter from "./validations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(initiativesRouter);
router.use(dashboardRouter);
router.use(documentsRouter);
router.use(settingsRouter);
router.use(validationsRouter);

export default router;
