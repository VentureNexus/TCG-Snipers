import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profilesRouter from "./profiles";
import creditCardsRouter from "./creditCards";
import proxiesRouter from "./proxies";
import taskGroupsRouter from "./taskGroups";
import tasksRouter from "./tasks";
import checkoutResultsRouter from "./checkoutResults";
import analyticsRouter from "./analytics";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profilesRouter);
router.use(creditCardsRouter);
router.use(proxiesRouter);
router.use(taskGroupsRouter);
router.use(tasksRouter);
router.use(checkoutResultsRouter);
router.use(analyticsRouter);
router.use(settingsRouter);

export default router;
