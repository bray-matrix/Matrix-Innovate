import { Router, type IRouter } from "express";
import healthRouter from "./health";
import initiativesRouter from "./initiatives";
import dashboardRouter from "./dashboard";
import documentsRouter from "./documents";
import settingsRouter from "./settings";
import validationsRouter from "./validations";
import backlogRouter from "./backlog";
import environmentRouter from "./environment";
import executionRouter from "./execution";
import governanceRouter from "./governance";
import portfolioRouter from "./portfolio";

const router: IRouter = Router();

router.use(healthRouter);
router.use(initiativesRouter);
router.use(dashboardRouter);
router.use(documentsRouter);
router.use(settingsRouter);
router.use(validationsRouter);
router.use(backlogRouter);
router.use(environmentRouter);
router.use(executionRouter);
router.use(governanceRouter);
router.use(portfolioRouter);

export default router;
