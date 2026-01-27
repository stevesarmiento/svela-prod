import {
  OpenPanelComponent,
  useOpenPanel,
} from "@openpanel/nextjs";
import { logger } from "@v1/logger";

const isProd = process.env.NODE_ENV === "production";

const Provider = () => (
  <OpenPanelComponent
    clientId={process.env.NEXT_PUBLIC_OPENPANEL_CLIENT_ID!}
    trackAttributes={true}
    trackScreenViews={isProd}
    trackOutgoingLinks={isProd}
  />
);

const track = (options: { event: string } & Record<string, unknown>) => {
  const { track: openTrack } = useOpenPanel();

  if (!isProd) {
    logger.info(options, "Track");

    return;
  }

  const { event, ...rest } = options;

  openTrack(event, rest);
};

export { Provider, track };
