import { cn } from "@v1/ui/cn";

interface IconProps {
  className?: string;
}

/** Envelope glyph for the email addresses list (viewBox 26×23). */
export function EmailIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 26 23"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M2.71094 5.63086L11.4189 10.7532C12.3951 11.3274 13.6058 11.3274 14.5819 10.7532L23.2899 5.63086"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1.61056 8.60088C1.73239 6.61446 1.79331 5.62126 2.27991 4.72178C2.68136 3.9797 3.40956 3.25186 4.15183 2.85078C5.05155 2.36463 6.06751 2.30281 8.09943 2.17919C9.76756 2.0777 11.526 2 13 2C14.474 2 16.2324 2.0777 17.9006 2.17919C19.9325 2.30281 20.9485 2.36463 21.8482 2.85078C22.5904 3.25186 23.3186 3.9797 23.7201 4.72178C24.2067 5.62126 24.2676 6.61446 24.3894 8.60088C24.4553 9.67381 24.5 10.7477 24.5 11.6842C24.5 12.6207 24.4553 13.6946 24.3894 14.7675C24.2676 16.754 24.2067 17.7472 23.7201 18.6466C23.3186 19.3887 22.5904 20.1166 21.8482 20.5176C20.9485 21.0038 19.9325 21.0656 17.9006 21.1892C16.2324 21.2907 14.474 21.3684 13 21.3684C11.526 21.3684 9.76756 21.2907 8.09943 21.1892C6.06751 21.0656 5.05155 21.0038 4.15183 20.5176C3.40956 20.1166 2.68136 19.3887 2.27991 18.6466C1.79331 17.7472 1.73239 16.754 1.61056 14.7675C1.54475 13.6946 1.5 12.6207 1.5 11.6842C1.5 10.7477 1.54475 9.67381 1.61056 8.60088Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Filled warning-triangle glyph for the delete account row (viewBox 32×32). */
export function DeleteAccountIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13.5412 7.40219C14.8011 5.53566 17.5203 5.53146 18.7824 7.39647C20.2563 9.57456 22.0545 12.3009 23.3533 14.4966C24.4972 16.4304 25.8309 18.9284 26.9312 21.0489C28.0046 23.1177 26.5738 25.5709 24.2451 25.6662C21.688 25.7709 18.5952 25.8716 16.1569 25.8716C13.7107 25.8716 10.6059 25.7703 8.04399 25.6652C5.72174 25.57 4.29188 23.1299 5.36025 21.0658C6.44463 18.9708 7.77125 16.4898 8.96045 14.4966C10.2288 12.3708 12.0489 9.61318 13.5412 7.40219ZM17.1475 17.5163L17.4574 12.8683C17.5075 12.1161 16.911 11.4785 16.1572 11.4785C15.4034 11.4785 14.8068 12.1161 14.857 12.8683L15.1668 17.5163C15.2016 18.0376 15.6346 18.4428 16.1572 18.4428C16.6797 18.4428 17.1127 18.0376 17.1475 17.5163ZM16.1565 22.1573C16.7975 22.1573 17.3172 21.6377 17.3172 20.9966C17.3172 20.3556 16.7975 19.8359 16.1565 19.8359C15.5154 19.8359 14.9957 20.3556 14.9957 20.9966C14.9957 21.6377 15.5154 22.1573 16.1565 22.1573Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Monitor-on-stand glyph for the active devices list (viewBox 24×24). */
export function ConnectedDeviceIcon({ className }: IconProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M12 3.5C10.1227 3.5 7.6559 3.65937 5.86356 3.79815C4.47715 3.90551 3.36443 4.97284 3.22571 6.35647C3.10931 7.51756 3 8.90061 3 10C3 11.0994 3.10931 12.4824 3.22571 13.6435C3.36443 15.0272 4.47715 16.0945 5.86356 16.2018C7.6559 16.3406 10.1227 16.5 12 16.5C13.8773 16.5 16.3441 16.3406 18.1364 16.2018C19.5229 16.0945 20.6356 15.0272 20.7743 13.6435C20.8907 12.4824 21 11.0994 21 10C21 8.90061 20.8907 7.51756 20.7743 6.35647C20.6356 4.97284 19.5229 3.90551 18.1364 3.79815C16.3441 3.65937 13.8773 3.5 12 3.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 20H15.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 17V20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
