import { Layer } from "effect";
import { ConvexService } from "./convex";
import { UpstreamHttp } from "./upstream-http";

export type ServerServices = UpstreamHttp | ConvexService;

export const ServerLayer: Layer.Layer<ServerServices> = Layer.mergeAll(
  UpstreamHttp.layer,
  ConvexService.layer,
);
