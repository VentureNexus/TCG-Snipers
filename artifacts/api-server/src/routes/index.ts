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
import ogImageRouter from "./ogImage";
import retailerAccountsRouter from "./retailerAccounts";
import captchaAssistRouter from "./captchaAssist";
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
router.use(ogImageRouter);
router.use(retailerAccountsRouter);
router.use(captchaAssistRouter);

export default router;
