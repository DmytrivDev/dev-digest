/* The setup-docs help line (AC-16): shown under a failed preview and on the
   Install step, so an error always carries the way to fix the setup. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { DOCS_URL } from "../../constants";
import { s } from "../../styles";

export function DocsHelpLink() {
  const t = useTranslations("ci");
  return (
    <div style={s.help}>
      {t.rich("exportWizard.install.help", {
        a: (chunks) => (
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" style={s.link}>
            {chunks}
          </a>
        ),
      })}
    </div>
  );
}
