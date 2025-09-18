"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{
        style: {
          //textAlign: "center",
          //padding: "16px 24px",
          //borderRadius: "12px",
          //boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          //fontWeight: "500",
          //marginTop: "20px",
          //display: "flex",
          //alignItems: "center",
          //justifyContent: "center",
          //backgroundColor: "var(--background)",
          //backdropFilter: "blur(10px)",
          //flexDirection: "row",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
