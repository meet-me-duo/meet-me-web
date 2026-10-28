# Sign-in assets

Retrieved 2026-10-28 from the providers' official resources, unmodified.

- `google-signin.png`: Android + Web / PNG @3x / Light / text Yes / Square,
  from https://developers.google.com/static/identity/images/signin-assets.zip
  under https://developers.google.com/identity/branding-guidelines?hl=en.
  The pre-approved complete image keeps Google's logo, font, spacing and border.
- `kakao-login.svg`: complete Korean button from
  https://developers.kakao.com/tool/images/resource/preview/login-complete-ko.svg
  via https://developers.kakao.com/tool/resource/login and
  https://developers.kakao.com/docs/ko/kakaologin/design-guide.

Both images retain their aspect ratios and equal displayed widths. Provider
marks remain their owners' trademarks. These assets only start the existing
server OAuth navigation; they do not add a client auth SDK or provider.

## Current Google neutral button

`google-g.svg` preserves all five SVG paths, fills and `viewBox` from the official
HTML/CSS configurator export supplied by the user. Source:
https://developers.google.com/identity/branding-guidelines#render-html-button-element.
The previous complete `google-signin.png` remains unchanged for provenance; it is
not cropped or used to obtain this independent symbol.

The supplied neutral surface is #F2F2F2 with no stroke, a 20px symbol and 14px
medium text. Its 40px visible surface is centered in a 46px OAuth link target.
The label is localized to `Google로 로그인`; the existing server navigation and
return handler are retained. Noninteractive spans replace the generator's button
so no button is nested inside a link. Focus is drawn on the link, and disabled
selectors follow its `aria-disabled` state. No Google SDK or font download is added.

Google brand marks remain Google's trademarks and are used under its branding
guidelines. Google Developers code-sample licensing is described at
https://developers.google.com/terms/site-policies; the HTML/CSS adaptation is
provided with the Apache 2.0 code-sample license in `GOOGLE-CODE-LICENSE.txt`.
This license does not grant trademark rights.
