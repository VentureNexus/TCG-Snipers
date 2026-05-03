import { Router, type IRouter } from "express";
import health from "./health";
import checkout from "./checkout";
import license from "./license";
import portal from "./portal";
import download from "./download";
import support from "./support";

const router: IRouter = Router();
router.use(health);
router.use(checkout);
router.use(license);
router.use(portal);
router.use(download);
router.use(support);

export default router;
