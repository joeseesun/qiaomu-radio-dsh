/**
 * `support` — donate / follow / source links.
 *
 * The reference opens the two QR codes in a portal-rendered modal. The client
 * bundle must not import `react-dom`, so the dialog is rendered in place and
 * positioned absolutely over the device screen instead. It keeps the same
 * dialog semantics: `role="dialog"`, `aria-modal`, Escape to close and focus
 * moved to the close button on open.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BadgeDollarIcon, CloseIcon, CodeIcon, ExternalLinkIcon, QrCodeIcon, SupportIcon } from "../icons";
import { h } from "../ui";
import type { RadioController } from "../useRadio";

type Dialog = "reward" | "follow" | null;

const QR_ASSETS: Record<Exclude<Dialog, null>, string> = {
  reward: "assets/qiaomu_reward_qr.png",
  follow: "assets/qiaomu_wechat_public_account_qr.jpg",
};

export function SupportPanel(props: { controller: RadioController }): ReactNode {
  const controller = props.controller;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!dialog) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close is stable enough for a key listener
  }, [dialog]);

  const open = (next: Exclude<Dialog, null>, trigger: HTMLButtonElement | null) => {
    triggerRef.current = trigger;
    setImageFailed(false);
    setDialog(next);
  };
  const close = () => {
    setDialog(null);
    setTimeout(() => triggerRef.current?.focus(), 0);
  };

  return h(
    "div",
    { className: "support-panel" },
    h(
      "h2",
      null,
      SupportIcon({ size: 18 }),
      controller.t("support.title"),
    ),
    h("p", null, controller.t("support.text")),
    h(
      "div",
      { className: "support-actions" },
      h(
        "button",
        {
          type: "button",
          onClick: (event: { currentTarget: HTMLButtonElement }) =>
            open("reward", event.currentTarget),
        },
        BadgeDollarIcon({ size: 18 }),
        h("span", null, controller.t("support.reward")),
      ),
      h(
        "button",
        {
          type: "button",
          onClick: (event: { currentTarget: HTMLButtonElement }) =>
            open("follow", event.currentTarget),
        },
        QrCodeIcon({ size: 18 }),
        h("span", null, controller.t("support.follow")),
      ),
    ),
    h(
      "div",
      { className: "support-links" },
      h(
        "a",
        { href: "https://github.com/joeseesun/qiaomu-radio", target: "_blank", rel: "noreferrer" },
        CodeIcon({ size: 16 }),
        controller.t("support.source"),
        ExternalLinkIcon({ size: 13 }),
      ),
      h(
        "a",
        { href: "https://x.com/vista8", target: "_blank", rel: "noreferrer" },
        "X · @vista8",
        ExternalLinkIcon({ size: 13 }),
      ),
      h(
        "a",
        { href: "https://tuijian.qiaomu.ai/", target: "_blank", rel: "noreferrer" },
        controller.t("support.recommend"),
        ExternalLinkIcon({ size: 13 }),
      ),
    ),
    dialog
      ? h(
          "div",
          {
            className: "support-modal",
            role: "presentation",
            onMouseDown: (event: { target: unknown; currentTarget: unknown }) => {
              if (event.target === event.currentTarget) close();
            },
          },
          h(
            "section",
            { role: "dialog", "aria-modal": "true", "aria-labelledby": "support-dialog-title" },
            h(
              "button",
              {
                className: "support-close",
                type: "button",
                ref: closeRef,
                "aria-label": controller.t("support.close"),
                onClick: close,
              },
              CloseIcon({ size: 20 }),
            ),
            h(
              "h2",
              { id: "support-dialog-title" },
              dialog === "reward" ? controller.t("support.reward") : controller.t("support.followTitle"),
            ),
            imageFailed
              ? null
              : h("img", {
                  src: controller.asset(QR_ASSETS[dialog]),
                  alt: dialog === "reward" ? "向阳乔木打赏二维码" : "向阳乔木推荐看公众号二维码",
                  onError: () => setImageFailed(true),
                }),
            imageFailed
              ? h(
                  "a",
                  {
                    className: "support-qr-fallback",
                    href: "https://qiaomu.ai/",
                    target: "_blank",
                    rel: "noreferrer",
                  },
                  controller.t("support.recommend"),
                  ExternalLinkIcon({ size: 14 }),
                )
              : null,
            h(
              "p",
              null,
              dialog === "reward" ? controller.t("support.thanks") : controller.t("support.wechat"),
            ),
            dialog === "follow"
              ? h(
                  "div",
                  { className: "support-modal-links" },
                  h(
                    "a",
                    { href: "https://github.com/joeseesun/", target: "_blank", rel: "noreferrer" },
                    CodeIcon({ size: 17 }),
                    "GitHub",
                  ),
                  h(
                    "a",
                    { href: "https://x.com/vista8", target: "_blank", rel: "noreferrer" },
                    "X · @vista8",
                  ),
                )
              : null,
          ),
        )
      : null,
  );
}