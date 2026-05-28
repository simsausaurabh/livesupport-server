import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    widgetOrg?: any;
    agent?: any;
  }
}