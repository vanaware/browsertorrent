
# BeerCSS

## Contents

[Start](#beercss), [Elements](#elements), [Helpers](#helpers), [Settings](#settings), [Summary](#summary), [beercss.com](https://www.beercss.com)

[Badge](#badge), [Button](#button), [Card](#card), [Checkbox](#checkbox), [Chip](#chip), [Container](#container), [Dialog](#dialog), [Expansion](#expansion), [Grid](#grid), [Icon](#icon), [Input](#input), [Layout](#layout), [Main layout](@main-layout), [Media](#media), [Menu](#menu), [Navigation](#navigation), [Overlay](#overlay), [Page](#page), [Progress](#progress), [Radio](#radio), [Select](#select), [Slider](#slider), [Switch](#switch), [Table](#table), [Tabs](#tabs), [Textarea](#textarea), [Snackbar](#snackbar), [Tooltip](#tooltip), [Typography](#typography)

## Get started

#### CDN

From jsdelivr.net.

```html
// with html
<link href="https://cdn.jsdelivr.net/npm/beercss@3.4.9/dist/cdn/beer.min.css" rel="stylesheet" />
<script type="module" src="https://cdn.jsdelivr.net/npm/beercss@3.4.9/dist/cdn/beer.min.js"></script>
<script type="module" src="https://cdn.jsdelivr.net/npm/material-dynamic-colors@1.1.0/dist/cdn/material-dynamic-colors.min.js"></script>
```

```css
// with css
@import "https://cdn.jsdelivr.net/npm/beercss@3.4.9/dist/cdn/beer.min.css";
```

```js
// with javascript
import "https://cdn.jsdelivr.net/npm/beercss@3.4.9/dist/cdn/beer.min.js";
import "https://cdn.jsdelivr.net/npm/material-dynamic-colors@1.1.0/dist/cdn/material-dynamic-colors.min.js";
```

#### NPM

You can get the latest release using NPM. This release contains source files as well as the compiled CSS and JavaScript files.

```js
// installing
npm i beercss
npm i material-dynamic-colors
```

```js
// importing as window.beercss and window.materialDynamicColors
import "beercss";
import "material-dynamic-colors";
```

```js
// importing as beercss and materialDynamicColors
import beercss from "beercss";
import materialDynamicColors from "material-dynamic-colors";
```

```js
// importing manually from dist
import "beercss/dist/cdn/beer.min.css";
import beercss from "beercss/dist/cdn/beer.min.js";
import materialDynamicColors from "material-dynamic-colors/dist/cdn/material-dynamic-colors.min.js";
```

```js
// importing manually from src
import "beercss/src/cdn/beer.css";
import beercss from "beercss/src/cdn/beer.ts";
import materialDynamicColors from "material-dynamic-colors/src/cdn/material-dynamic-colors.js";
```

### HTML

You can use this html to setup your project. See on [Codepen](https://codepen.io/leo-bnu/pen/yLKLPxj). More about it in [Main layout](#main-layout).

```html
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <meta name="google" content="notranslate">
    <title>Hello world</title>
    <link href="https://cdn.jsdelivr.net/npm/beercss@3.4.9/dist/cdn/beer.min.css" rel="stylesheet">
    <script type="module" src="https://cdn.jsdelivr.net/npm/beercss@3.4.9/dist/cdn/beer.min.js"></script>
    <script type="module" src="https://cdn.jsdelivr.net/npm/material-dynamic-colors@1.1.0/dist/cdn/material-dynamic-colors.min.js"></script>
  </head>
  <body class="dark">
    <nav class="left drawer l">
      <header>
        <nav>
          <img src="https://www.beercss.com/favicon.png" class="circle">
          <h6>Cheers</h6>
        </nav>
      </header>
      <a>
        <i>home</i>
        <div>Home</div>
      </a>
      <a>
        <i>search</i>
        <div>Search</div>
      </a>
      <a>
        <i>share</i>
        <div>Share</div>
      </a>
      <a>
        <i>more_vert</i>
        <div>More</div>
      </a>
      <div class="divider"></div>
      <label>Label</label>
      <a>
        <i>widgets</i>
        <div>Widgets</div>
      </a>
      <a>
        <i>chat</i>
        <div>Chat</div>
      </a>
      <a>
        <i>help</i>
        <div>Help</div>
      </a>  
    </nav>

    <nav class="left m">
      <header>
        <img src="https://www.beercss.com/favicon.png" class="circle">
      </header>
      <a>
        <i>home</i>
        <div>Home</div>
      </a>
      <a>
        <i>search</i>
        <div>Search</div>
      </a>
      <a>
        <i>share</i>
        <div>Share</div>
      </a>
      <a>
        <i>more_vert</i>
        <div>More</div>
      </a>
    </nav>

    <nav class="bottom s">
      <a>
        <i>home</i>
      </a>
      <a>
        <i>search</i>
      </a>
      <a>
        <i>share</i>
      </a>
      <a>
        <i>more_vert</i>
      </a>
    </nav>

    <main class="responsive">
      <img src="https://www.beercss.com/beer-and-woman.jpg" class="responsive round">
      <h3>Welcome</h3>
      <h5>The beer is ready!</h5>
    </main>
  </body>
</html>
```

**We recommend use the material-dynamic-colors only when your app needs to change theme at runtime.**

## [Settings section](#settings)

The settings affects all document.

## [Elements section](#elements)

The elements are the components, widgets or tags.

## [Helpers section](#helpers)

The common helpers makes the elements more scalable and customizable.

## Tips to master beercss

1. Try use helpers first, before any custom css.
2. To customize themes go to [Settings](#settings).
3. To quick learn the project go to [Summary](#summary).

# Summary

Use this page to learn. This page has the most used combinations of elements and helpers. This project has about 100 css classes.


## Elements

**absolute** left, right, top, bottom, front, back, small, medium, large

**&lt;article&gt;** small, medium, large, border, round, no-round, left-round, top-round, right-round, bottom-round, padding, no-padding, auto-padding, tiny-padding, small-padding, medium-padding, large-padding

**badge** left, right, top, bottom, border, circle, square, round, no-round, left-round, right-round, top-round, bottom-round

**button or &lt;button&gt;** small, medium, large, extra, none, extend, border, circle, square, round, no-round, left-round, right-round, top-round, bottom-round, responsive, horizontal, vertical

**chip** small, medium, large, border, no-border, circle, square, round, no-round, left-round, right-round, top-round, bottom-round, horizontal, vertical

**&lt;details&gt;**

**&lt;dialog&gt;** left, right, top, bottom, small, medium, large, modal, border, round, no-round, left-round, right-round, top-round, bottom-round, max, active

**field** small, medium, large, extra, label, border, round, fill, prefix, suffix, textarea 

**fixed** left, right, top, bottom, front, back, small, medium, large

**&lt;footer&gt;** fixed

**&lt;h1&gt;...&lt;h6&gt;** small, medium, large

**&lt;header&gt;** fixed

**&lt;i&gt;** tiny, small, medium, large, extra, fill

**&lt;img&gt;** tiny, small, medium, large, extra, circle, round, no-round, left-round, right-round, top-round, bottom-round, responsive

**&lt;label&gt;** active, radio, checkbox, switch

**&lt;main&gt;** responsive, max

**&lt;menu&gt;** left, right, wrap, no-wrap, min, max, active

**&lt;nav&gt;** left, right, top, bottom, drawer, min, max, left-align, right-align, center-align, top-align, bottom-align, middle-align, border, round, no-round, left-round, right-round, top-round, bottom-round, no-space, small-space, medium-space, large-space, wrap, no-wrap, margin, no-margin, tiny-margin, small-margin, medium-margin, large-margin

**overlay** left-align, right-align, center-align, top-align, bottom-align, middle-align, active

**page** left, right, top, bottom, active

***&lt;progress&gt;** small, medium, large, circle

**row** left-align, right-align, center-align, top-align, bottom-align, middle-align

**&lt;summary&gt;**

**&lt;table&gt;** left-align, right-align, center-align, no-space, space, small-space, medium-space, large-space, border, stripes, min, fixed

**tabs** left-align, right-align, center-align, horizontal, vertical, min, max

**snackbar** top, bottom, active

**tooltip** left, right, top, bottom, max

**&lt;video&gt;** tiny, small, medium, large, extra, circle, round, no-round, left-round, right-round, top-round, bottom-round, responsive

## Helpers

**Alignments** left-align, right-align, center-align, top-align, bottom-align, middle-align

**Blurs** blur, small-blur, medium-blur, large-blur, light, dark

**Colors** amber1, amber2, amber3, amber4, amber5, amber6, amber7, amber8, amber9, amber10, amber, amber-border, amber-text, blue1, blue2, blue3, blue4, blue5, blue6, blue7, blue8, blue9, blue10, blue, blue-border, blue-text, blue-grey1, blue-grey2, blue-grey3, blue-grey4, blue-grey5, blue-grey6, blue-grey7, blue-grey8, blue-grey9, blue-grey10, blue-grey, blue-grey-border, blue-grey-text, brown1, brown2, brown3, brown4, brown5, brown6, brown7, brown8, brown9, brown10, brown, brown-border, brown-text, cyan1, cyan2, cyan3, cyan4, cyan5, cyan6, cyan7, cyan8, cyan9, cyan10, cyan, cyan-border, cyan-text, deep-orange1, deep-orange2, deep-orange3, deep-orange4, deep-orange5, deep-orange6, deep-orange7, deep-orange8, deep-orange9, deep-orange10, deep-orange, deep-orange-border, deep-orange-text, deep-purple1, deep-purple2, deep-purple3, deep-purple4, deep-purple5, deep-purple6, deep-purple7, deep-purple8, deep-purple9, deep-purple10, deep-purple, deep-purple-border, deep-purple-text, green1, green2, green3, green4, green5, green6n, green7, green8, green9, green10, green, green-border, green-text, grey1, grey2, grey3, grey4, grey5, grey6, grey7, grey8, grey9, grey10, grey, grey-border, grey-text, indigo1, indigo2, indigo3, indigo4, indigo5, indigo6, indigo7, indigo8, indigo9, indigo10, indigo, indigo-border, indigo-text, light-blue1, light-blue2, light-blue3, light-blue4, light-blue5, light-blue6, light-blue7, light-blue8, light-blue9, light-blue10, light-blue, light-blue-border, light-blue-text, light-green1, light-green2, light-green3, light-green4, light-green5, light-green6, light-green7, light-green8, light-green9, light-green10, light-green, light-green-border, light-green-text, lime1, lime2, lime3, lime4, lime5, lime6, lime7, lime8, lime9, lime10, lime, lime-border, lime-text, orange1, orange2, orange3, orange4, orange5, orange6, orange7, orange8, orange9, orange10, orange, orange-border, orange-text, pink1, pink2, pink3, pink4, pink5, pink6, pink7, pink8, pink9, pink10, pink, pink-border, pink-text, purple1, purple2, purple3, purple4, purple5, purple6, purple7, purple8, purple9, purple10, purple, purple-border, purple-text, red1, red2, red3, red4, red5, red6, red7, red8, red9, red10, red, red-border, red-text, teal1, teal2, teal3, teal4, teal5, teal6, teal7, teal8, teal9, teal10, teal, teal-border, teal-text, yellow1, yellow2, yellow3, yellow4, yellow5, yellow6, yellow7, yellow8, yellow9, yellow10, yellow, yellow-border, yellow-text

**Directions** horizontal, vertical

**Dividers** divider, small-divider, medium-divider, large-divider

**Elevates** elevate, no-elevate, small-elevate, medium-elevate, large-elevate

**Forms** border, no-border, circle, square, none, fill, extend, drawer, round, no-round, small-round, medium-round, large-round, left-round, right-round, top-round, bottom-round

**Margins** margin, no-margin, auto-margin, tiny-margin, small-margin, medium-margin, large-margin, left-margin, right-margin, top-margin, bottom-margin, horizontal-margin, vertical-margin

**Opacities** opacity, no-opacity, small-opacity, medium-opacity, large-opacity

**Paddings** padding, no-padding, auto-padding, tiny-padding small-padding, medium-padding, large-padding, left-padding, right-padding, top-padding, bottom-padding, horizontal-padding, vertical-padding

**Positions** left, right, center, top, bottom, middle, front, back

**Responsive** responsive, small-device, medium-device, large-device, s, m, l

**Scrolls** scroll, no-scroll

**Shadows** shadow, left-shadow, right-shadow, top-shadow, bottom-shadow

**Sizes** tiny, small, medium, large, extra, wrap, no-wrap, max, small-width, medium-width, large-width, small-height, medium-height, large-height

**Spaces** space, no-space, small-space, medium-space, large-space

**Theme** light, dark, primary, primary-text, primary-border, primary-container, secondary, secondary-text, secondary-border, secondary-container, tertiary, tertiary-text, tertiary-border, tertiary-container, error, error-text, error-border, error-container, background, surface, surface-variant, inverse-surface, inverse-primary, inverse-primary-text, inverse-primary-border, black, black-text, black-border, white, white-text, white-border, transparent, transparent-text, transparent-border

**Triggers** active

**Typography** italic, bold, underline, overline, upper, lower, capitalize, link, small-text, medium-text, large-text 

**Waves** wave, no-wave, light, dark

## Settings

**Variables** --primary, --on-primary, --primary-container, --on-primary-container, --secondary, --on-secondary, --secondary-container, --on-secondary-container, --tertiary, --on-tertiary, --tertiary-container, --on-tertiary-container, --error, --on-error, --error-container, --on-error-container, --background, --on-background, --surface, --on-surface, --surface-variant, --on-surface-variant, --outline, --outline-variant, --shadow, --scrim, --inverse-surface, --inverse-on-surface, --inverse-primary, --surface-dim, --surface-bright, --surface-container-lowest, --surface-container-low, --surface-container, --surface-container-high, --surface-container-highest, --outline, --active, --overlay, --font, --size, --elevate1, --elevate2, --elevate3, --speed1, --speed2, --speed3, --speed4

# ELEMENTS

## Badge

Badges are generally used to emphasize some elements and they are placed in element corners.

## Button

Buttons allow users to take actions, and make choices, with a single tap.

## Card

Cards are surfaces that display content and actions on a single topic. They should be easy to scan for relevant and actionable information. Elements, like text and images, should be placed on them in a way that clearly indicates hierarchy.

## Checkbox

Checkboxes allow users to select one or more items from a set. Checkboxes can turn an option on or off.

## Chip

Chips are compact elements that represent an input, attribute, or action.

## Container

A container is the main content of page.

## Dialog

Dialogs inform users about a task and can contain critical information, required decisions, involve multiple tasks, provide access to destinations in your app and contain a small forms to submit.

## Expansion

Expansion contain creation flows and allow lightweight editing of an element.

## Grid

Grids are rows and cols system grid. They are most used to organize content.

## Icon

Material design system icons are simple, modern, friendly, and sometimes quirky. Each icon is created using our design guidelines to depict in simple and minimal forms the universal concepts used commonly throughout a UI. Ensuring readability and clarity at both large and small sizes, these icons have been optimized for beautiful display on all common platforms and display resolutions.

## Input

Input fields let users enter and edit text.

## Layout

Layouts are containers that you can place in any position. There are absolute and fixed elements.

## Media

Media can be a image or video element.

## Menu

Menus display a list of choices on temporary surfaces.

## Navigation

Navigations are containers that display actions placed horizontally or vertically. Elements, like buttons, chips, images, checkboxes, radios and switches can be placed inside a nav. Some examples are navigation rail or navigation bar.

## Overlay

Overlays block user screen and can express an unspecified wait time.

## Page

Pages are containers that can be a main page, multiple pages or just to animate an element.

## Progress

Progress display the length of a process or an unspecified wait time.

## Radio

Radio buttons allow users to select one option from a set.

## Select

Selects display a list of choices on temporary surfaces.

## Switch

Switches toggle the state of a single item on or off.

## Table

Tables display sets of data across rows and columns.

## Tabs

Tabs organize content across different screens, data sets, and other interactions.

## Textarea

Textarea fields let users enter and edit long text.

## Snackbar

Snackbars provide brief messages about app processes at bottom or top of the screen. It's not recomended to show two or more snackbars at same time.

## Tooltip

Tooltips displays informative text when users hover over, focus on, or tap an element.

## Typography

Use typography to present your design and content as clearly and efficiently as possible.

# Expansion

Expansion contain creation flows and allow lightweight editing of an element.

## Element

```html
<details>
  <summary>...</summary>
  <...>...</...>
</details>
```

## Example multiple levels

```html
<details>
  <summary>...</summary>
  <details>
    <summary>...</summary>
    <details>
      <summary>...</summary>
      <...>...</...>
    </details>
  </details>
</details>
```

## Example custom summary

```html
<details>
  <summary class="none">
    <...>...</...>
  </summary>
  <...>...</...>
</details>
```

# HELPERS

## Alignments

left-align, right-align, center-align, top-align, bottom-align, middle-align

## Blurs

blur, small-blur, medium-blur, large-blur, light, dark

## Colors

amber1, amber2, amber3, amber4, amber5, amber6, amber7, amber8, amber9, amber10, amber, amber-border, amber-text

blue1, blue2, blue3, blue4, blue5, blue6, blue7, blue8, blue9, blue10, blue, blue-border, blue-text

blue-grey1, blue-grey2, blue-grey3, blue-grey4, blue-grey5, blue-grey6, blue-grey7, blue-grey8, blue-grey9, blue-grey10, blue-grey, blue-grey-border, blue-grey-text

brown1, brown2, brown3, brown4, brown5, brown6, brown7, brown8, brown9, brown10, brown, brown-border, brown-text

cyan1, cyan2, cyan3, cyan4, cyan5, cyan6, cyan7, cyan8, cyan9, cyan10, cyan, cyan-border, cyan-text

deep-orange1, deep-orange2, deep-orange3, deep-orange4, deep-orange5, deep-orange6, deep-orange7, deep-orange8, deep-orange9, deep-orange10, deep-orange, deep-orange-border, deep-orange-text

deep-purple1, deep-purple2, deep-purple3, deep-purple4, deep-purple5, deep-purple6, deep-purple7, deep-purple8, deep-purple9, deep-purple10, deep-purple, deep-purple-border, deep-purple-text

green1, green2, green3, green4, green5, green6n, green7, green8, green9, green10, green, green-border, green-text

grey1, grey2, grey3, grey4, grey5, grey6, grey7, grey8, grey9, grey10, grey, grey-border, grey-text

indigo1, indigo2, indigo3, indigo4, indigo5, indigo6, indigo7, indigo8, indigo9, indigo10, indigo, indigo-border, indigo-text

light-blue1, light-blue2, light-blue3, light-blue4, light-blue5, light-blue6, light-blue7, light-blue8, light-blue9, light-blue10, light-blue, light-blue-border, light-blue-text

light-green1, light-green2, light-green3, light-green4, light-green5, light-green6, light-green7, light-green8, light-green9, light-green10, light-green, light-green-border, light-green-text

lime1, lime2, lime3, lime4, lime5, lime6, lime7, lime8, lime9, lime10, lime, lime-border, lime-text

orange1, orange2, orange3, orange4, orange5, orange6, orange7, orange8, orange9, orange10, orange, orange-border, orange-text

pink1, pink2, pink3, pink4, pink5, pink6, pink7, pink8, pink9, pink10, pink, pink-border, pink-text

purple1, purple2, purple3, purple4, purple5, purple6, purple7, purple8, purple9, purple10, purple, purple-border, purple-text

red1, red2, red3, red4, red5, red6, red7, red8, red9, red10, red, red-border, red-text

teal1, teal2, teal3, teal4, teal5, teal6, teal7, teal8, teal9, teal10, teal, teal-border, teal-text

yellow1, yellow2, yellow3, yellow4, yellow5, yellow6, yellow7, yellow8, yellow9, yellow10, yellow, yellow-border, yellow-text

## Directions

horizontal, vertical

## Dividers

divider, small-divider, medium-divider, large-divider

## Elevates

elevate, no-elevate, small-elevate, medium-elevate, large-elevate, 

## Forms

border, no-border, circle, square, none, fill, extend, drawer, round, no-round, small-round, medium-round, large-round, left-round, right-round, top-round, bottom-round

## Margins

margin, no-margin, auto-margin, tiny-margin, small-margin, medium-margin, large-margin, left-margin, right-margin, top-margin, bottom-margin, horizontal-margin, vertical-margin

## Opacities

opacity, no-opacity, small-opacity, medium-opacity, large-opacity

## Paddings

padding, no-padding, auto-padding, tiny-padding, small-padding, medium-padding, large-padding, left-padding, right-padding, top-padding, bottom-padding, horizontal-padding, vertical-padding

## Positions

left, right, center, top, bottom, middle, front, back

## Responsive

responsive, s, m, l

## Scrolls

scroll, no-scroll

## Shadows

shadow, left-shadow, right-shadow, top-shadow, bottom-shadow

## Sizes

tiny, small, medium, large, extra, wrap, no-wrap, max, small-width, medium-width, large-width, small-height, medium-height, large-height

## Spaces

space, no-space, small-space, medium-space, large-space

## Theme

light, dark

primary, primary-text, primary-border, primary-container

secondary, secondary-text, secondary-border, secondary-container

tertiary, tertiary-text, tertiary-border, tertiary-container

error, error-text, error-border, error-container

background, surface, surface-variant, inverse-surface

inverse-primary, inverse-primary-text, inverse-primary-border

black, black-text, black-border

white, white-text, white-border

transparent, transparent-text, transparent-border

## Triggers

active

## Typography

h1, h2, h3, h4, h5, h6, italic, bold, underline, overline, upper, lower, capitalize, link, small-text, medium-text, large-text

## Waves

wave, no-wave, light, dark

# SETTINGS

## Default theme

It sets the default theme to dark or light.

#### Classes

light, dark

#### Variables

--primary, --on-primary, --primary-container, --on-primary-container, --secondary, --on-secondary, --secondary-container, --on-secondary-container, --tertiary, --on-tertiary, --tertiary-container, --on-tertiary-container, --error, --on-error, --error-container, --on-error-container, --background, --on-background, --surface, --on-surface, --surface-variant, --on-surface-variant, --outline, --outline-variant, --shadow, --scrim, --inverse-surface, --inverse-on-surface, --inverse-primary, --surface-dim, --surface-bright, --surface-container-lowest, --surface-container-low, --surface-container, --surface-container-high, --surface-container-highest --active, --overlay, --elevate1, --elevate2, --elevate3, --size, --font, --font-icon, --speed1, --speed2, --speed3, --speed4

#### Example

The default theme is light. Use dark to change the default theme to dark.

```html
<body>...</body>

<body class="light">...</body>

<body class="dark">...</body>
```

## Dynamic theme

It sets the theme and mode at runtime. You need to use [material-dynamic-colors](https://www.npmjs.com/package/material-dynamic-colors). You can get a real example of dynamic theme [in this codepen](https://codepen.io/leo-bnu/pen/LYWxjVG).

#### To change theme

Call `ui("theme", "color|path|url|file|blob|theme")`. It returns the new theme and applies on body element.

```js
// From color
let theme = await ui("theme", "#ffd700");

// From path
let theme = await ui("theme", "/image.png");

// From url (caution with cors error)
let theme = await ui("theme", "http://domain.com/image.png");

// From file
let file = document.query("input[type='file']").files[0];
let theme = await ui("theme", file);

// From blob
let blob = new Blob();
let theme = await ui("theme", blob);

// From theme
let theme = await ui("theme", theme);

// Get current theme
let theme = await ui("theme");

// The returned theme is
{
  dark: "--primary:#cfbcff;--on-primary:#381e72;--primary-container:#4f378a;--on-primary-container:#e9ddff;--secondary:#cbc2db;--on-secondary:#332d41;--secondary-container:#4a4458;--on-secondary-container:#e8def8;--tertiary:#efb8c8;--on-tertiary:#4a2532;--tertiary-container:#633b48;--on-tertiary-container:#ffd9e3;--error:#ffb4ab;--on-error:#690005;--error-container:#93000a;--on-error-container:#ffb4ab;--background:#1c1b1e;--on-background:#e6e1e6;--surface:#141316;--on-surface:#e6e1e6;--surface-variant:#49454e;--on-surface-variant:#cac4cf;--outline:#948f99;--outline-variant:#49454e;--shadow:#000000;--scrim:#000000;--inverse-surface:#e6e1e6;--inverse-on-surface:#313033;--inverse-primary:#6750a4;--surface-dim:#141316;--surface-bright:#3a383c;--surface-container-lowest:#0f0e11;--surface-container-low:#1c1b1e;--surface-container:#201f22;--surface-container-high:#2b292d;--surface-container-highest:#363438;",
  light: "--primary:#6750a4;--on-primary:#ffffff;--primary-container:#e9ddff;--on-primary-container:#22005d;--secondary:#625b71;--on-secondary:#ffffff;--secondary-container:#e8def8;--on-secondary-container:#1e192b;--tertiary:#7e5260;--on-tertiary:#ffffff;--tertiary-container:#ffd9e3;--on-tertiary-container:#31101d;--error:#ba1a1a;--on-error:#ffffff;--error-container:#ffdad6;--on-error-container:#410002;--background:#fffbff;--on-background:#1c1b1e;--surface:#fdf8fd;--on-surface:#1c1b1e;--surface-variant:#e7e0eb;--on-surface-variant:#49454e;--outline:#7a757f;--outline-variant:#cac4cf;--shadow:#000000;--scrim:#000000;--inverse-surface:#313033;--inverse-on-surface:#f4eff4;--inverse-primary:#cfbcff;--surface-dim:#ddd8dd;--surface-bright:#fdf8fd;--surface-container-lowest:#ffffff;--surface-container-low:#f7f2f7;--surface-container:#f2ecf1;--surface-container-high:#ece7eb;--surface-container-highest:#e6e1e6;"
}
```

#### To change mode

Call `ui("mode", "light|dark")` to set current theme between light and dark.

```js
// To light
let mode = ui("mode", "light");

// To dark
let mode = ui("mode", "dark");

// Get current mode
let mode = ui("mode");

// The returned mode is
"light" or "dark"
```

## Customize the default theme

To customize the default theme, you need to use the css structure below.

#### Example

```css
:root,
body.light {
  --primary: #6750a4;
  --on-primary: #ffffff;
  --primary-container: #e9ddff;
  --on-primary-container: #22005d;
  --secondary: #625b71;
  --on-secondary: #ffffff;
  --secondary-container: #e8def8;
  --on-secondary-container: #1e192b;
  --tertiary: #7e5260;
  --on-tertiary: #ffffff;
  --tertiary-container: #ffd9e3;
  --on-tertiary-container: #31101d;
  --error: #ba1a1a;
  --on-error: #ffffff;
  --error-container: #ffdad6;
  --on-error-container: #410002;
  --background: #fffbff;
  --on-background: #1c1b1e;
  --surface: #fdf8fd;
  --on-surface: #1c1b1e;
  --surface-variant: #e7e0eb;
  --on-surface-variant: #49454e;
  --outline: #7a757f;
  --outline-variant: #cac4cf;
  --shadow: #000000;
  --scrim: #000000;
  --inverse-surface: #313033;
  --inverse-on-surface: #f4eff4;
  --inverse-primary: #cfbcff;
  --surface-dim: #ddd8dd;
  --surface-bright: #fdf8fd;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #f7f2f7;
  --surface-container: #f2ecf1;
  --surface-container-high: #ece7eb;
  --surface-container-highest: #e6e1e6;
  --overlay: rgb(0 0 0 / 0.5);
  --active: rgb(0 0 0 / 0.1);
  --elevate1: 0 0.125rem 0.125rem 0 rgb(0 0 0 / 0.32);
  --elevate2: 0 0.25rem 0.5rem 0 rgb(0 0 0 / 0.4);
  --elevate3: 0 0.375rem 0.75rem 0 rgb(0 0 0 / 0.48);
}

body.dark {
  --primary: #cfbcff;
  --on-primary: #381e72;
  --primary-container: #4f378a;
  --on-primary-container: #e9ddff;
  --secondary: #cbc2db;
  --on-secondary: #332d41;
  --secondary-container: #4a4458;
  --on-secondary-container: #e8def8;
  --tertiary: #efb8c8;
  --on-tertiary: #4a2532;
  --tertiary-container: #633b48;
  --on-tertiary-container: #ffd9e3;
  --error: #ffb4ab;
  --on-error: #690005;
  --error-container: #93000a;
  --on-error-container: #ffb4ab;
  --background: #1c1b1e;
  --on-background: #e6e1e6;
  --surface: #141316;
  --on-surface: #e6e1e6;
  --surface-variant: #49454e;
  --on-surface-variant: #cac4cf;
  --outline: #948f99;
  --outline-variant: #49454e;
  --shadow: #000000;
  --scrim: #000000;
  --inverse-surface: #e6e1e6;
  --inverse-on-surface: #313033;
  --inverse-primary: #6750a4;
  --surface-dim: #141316;
  --surface-bright: #3a383c;
  --surface-container-lowest: #0f0e11;
  --surface-container-low: #1c1b1e;
  --surface-container: #201f22;
  --surface-container-high: #2b292d;
  --surface-container-highest: #363438;
  --overlay: rgb(0 0 0 / 0.5);
  --active: rgb(255 255 255 / 0.2);
  --elevate1: 0 0.125rem 0.125rem 0 rgb(0 0 0 / 0.32);
  --elevate2: 0 0.25rem 0.5rem 0 rgb(0 0 0 / 0.4);
  --elevate3: 0 0.375rem 0.75rem 0 rgb(0 0 0 / 0.48);
}
```

## Others

It sets the hover background, the overlay background, the font family order and the relative size of all elements.

#### Variables

--active, --overlay, --size

## Fonts

It sets the font and icon font of project.

#### Variables

--font, --font-icon

#### Examples

```css
 /* To import your custom font */
@import "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap";

:root {
  /* To use your custom font */
  --font: "Roboto Flex";

  /* To remove default icons */
  --font-icon: none;

  /* To use default outlined icons */
  --font-icon: "Material Symbols Outlined";

  /* To use default rounded icons */
  --font-icon: "Material Symbols Rounded";

  /* To use default sharp icons */
  --font-icon: "Material Symbols Sharp";
}
```

## Elevates

It sets the box-shadow property of elements.

#### Variables

--elevate1, --elevate2, --elevate3

## Speed

It sets the animation speed of elements.

#### Variables

--speed1, --speed2, --speed3, --speed4

# Badge

Badges are generally used to emphasize some elements and they are placed in element corners.

## Element

```html
<...>
  <div class="badge">...</div>
</...>
```

## Most used helpers

**Colors**

fill, primary, secondary, tertiary

**Forms**

border, circle, square, round, no-round, left-round, right-round, top-round, bottom-round

**Positions**

left, right, top, bottom

## Example

```html
<button class="circle">
  <i>home</i>
  <div class="badge">10</div>
</button>

<a class="chip circle">
  <i>home</i>
  <div class="badge">10</div>
</a>
```

# Button

Buttons allow users to take actions, and make choices, with a single tap.

## Element

```
<button>...</button>
<a class="button">...</a>
```

## Most used helpers

**Colors**

fill, primary, secondary, tertiary

**Directions**

horizontal, vertical

**Forms**

border, circle, square, round, no-round, left-round, right-round, top-round, bottom-round, responsive, none, extend

**Sizes**

small, medium, large, extra

## Example

```html
<button>Button</button>

<button>
  <i>home</i>
  <span>Button</span>
</button>
```

## Responsive button example

The responsive button is a button that automatically adjust with the width of your container.

```html
<button class="responsive">Button</button>

<button class="responsive">
  <i>home</i>
  <span>Button</span>
</button>
```

## FAB example

A floating action button (FAB) represents the primary action of a screen.

```html
<button class="circle extra">
  <i>home</i>
</button>
```

## Extended FAB example

The extended FAB is wider, and it includes a text label.

```html
<button class="extend circle">
  <i>home</i>
  <span>Button</span>
</button>
```

## Icon button example

The transparent button is a button for navigation. The shape of button will be revealed on button actions. Combine with icons and images.

```html
<button class="transparent circle">
  <i>home</i>
</button>

<button class="transparent circle">
  <img class="responsive" src="/image.png">
</button>
```

## Segmented button example

Segmented buttons can have 2-5 segments. Each segment is clearly divided and contains label text, an icon, or both.

```html
<nav class="no-space">
  <button class="border left-round">Left</button>
  <button class="border no-round">Center</button>
  <button class="border right-round">Right</button>
</nav>

<nav class="no-space">
  <button class="border left-round max">Left</button>
  <button class="border no-round max">Center</button>
  <button class="border right-round max">Right</button>
</nav>
```

# Card

Cards are surfaces that display content and actions on a single topic. They should be easy to scan for relevant and actionable information. Elements, like text and images, should be placed on them in a way that clearly indicates hierarchy.

## Element

```html
<article>...</article>
```

## Most used helpers

**Colors**

fill, primary-container, secondary-container, tertiary-container

**Forms**

border, round, no-round, left-round, top-round, right-round, bottom-round

**Paddings**

padding, no-padding, tiny-padding, small-padding, medium-padding, large-padding

**Elevates**

elevate, no-elevate, small-elevate, medium-elevate, large-elevate

**Sizes**

small, medium, large

## Example

```html
<article>
  <h5>Title</h5>
  <div>Description</div>
  <nav>
    <button>Button 1</button>
    <button>Button 2</button>
  </nav>
</article>
```

# Checkbox

Checkboxes allow users to select one or more items from a set. Checkboxes can turn an option on or off.

## Element

```html
<label class="checkbox">
  <input type="checkbox">
  <span></span>
</label>
```

## Example

```html
<label class="checkbox">
  <input type="checkbox">
  <span></span>
</label>

<label class="checkbox">
  <input type="checkbox">
  <span>Click here</span>
</label>

<label class="checkbox icon">
  <input type="checkbox">
  <span>
    <i>close</i>
    <i>done</i>
  </span>
</label>

<nav>
  <label class="checkbox">
    <input type="checkbox">
    <span>Item 1</span>
  </label>
  <label class="checkbox">
    <input type="checkbox">
    <span>Item 2</span>
  </label>
  <label class="checkbox">
    <input type="checkbox">
    <span>Item 3</span>
  </label>
</nav>
```

## In field elements example

```html
<div class="field middle-align">
  <nav>
    <label class="checkbox">
      <input type="checkbox">
      <span>Item 1</span>
    </label>
    <label class="checkbox">
      <input type="checkbox">
      <span>Item 2</span>
    </label>
    <label class="checkbox">
      <input type="checkbox">
      <span>Item 3</span>
    </label>
  </nav>
</div>
```

# Chip

Chips are compact elements that represent an input, attribute, or action.

## Element

```html
<a class="chip">...</a>
```

## Most used helpers

**Colors**

fill, primary, secondary, tertiary

**Directions**

horizontal, vertical

**Forms**

border, circle, square, round, no-round, left-round, right-round, top-round, bottom-round

**Sizes**

small, medium, large


## Example

```html
<a class="chip">Chip</a>

<a class="chip">
  <i>home</i>
  <span>Chip</span>
</a>
```

# Container

A container is the main content of page.

## Element

```html
<main class="responsive">...</main>
```

## Most used helpers

**Sizes**

responsive, max

## Example

```html
<main class="responsive"></main>
```

# Dialog

Dialogs inform users about a task and can contain critical information, required decisions, involve multiple tasks, provide access to destinations in your app and contain a small forms to submit.

## Element

```html
<dialog>...</dialog>
```

## Most used helpers

**Colors**

fill, primary-container, secondary-container, tertiary-container

**Forms**

modal, border, round, no-round, left-round, right-round, top-round, bottom-round

**Paddings**

padding, no-padding, tiny-padding, small-padding, medium-padding, large-padding

**Positions**

left, right, top, bottom

**Elevates**

elevate, no-elevate, small-elevate, medium-elevate, large-elevate

**Sizes**

small, medium, large, max

**Triggers**

active

## Example

```html
<div class="dialog">
  <h5>Title</h5>
  <p>Content of dialog</p>
  <nav>
    <button>Cancel</button>
    <button>Confirm</button>
  </nav>
</div>
```

## Triggers 

#### To open/close a dialog

#### Method 1

Add/remove `active` class on dialog.

```html
<div class="dialog active">
  <h5>Title</h5>
  <p>Content of dialog</p>
  <nav>
    <button>Cancel</button>
    <button>Confirm</button>
  </nav>
</div>
```

#### Method 2

Call HTML dialog element methods

```html
<div class="dialog" id="dialog">
  <h5>Title</h5>
  <p>Content of dialog</p>
  <nav>
    <button>Cancel</button>
    <button>Confirm</button>
  </nav>
</div>
```

```js
document.querySelector('#dialog').show(); // open
document.querySelector('#dialog').showModal(); // open as modal
document.querySelector('#dialog').close(); // close
```

#### Method 3

Add `data-ui="dialog-selector"` attribute on elements.

```html
<button data-ui="#dialog">Open dialog</button>

<div class="dialog" id="dialog">
  <h5>Title</h5>
  <p>Content of dialog</p>
  <nav>
    <button data-ui="#dialog">Cancel</button>
    <button data-ui="#dialog">Confirm</button>
  </nav>
</div>
```

#### Method 4

Call `ui("dialog-selector")`

```html
<div class="dialog" id="dialog">
  <h5>Title</h5>
  <p>Content of dialog</p>
  <nav>
    <button>Cancel</button>
    <button>Confirm</button>
  </nav>
</div>
```

```js
ui('#dialog');
```

# Grid

Grids are rows and cols system grid. They are most used to organize content.

## Element

```html
<div class="grid">
  <div>...</div>
</div>
```

## Most used helpers

**Sizes**

s1...s12, m1...m12, l1...l12

**Spaces**

no-space, space, small-space, medium-space, large-space

## Example

This will render one or more lines, depends the user screen.

```html
<div class="grid">
  <div class="s12 m6 l3">
    <h5>First</h5>
  </div>
  <div class="s12 m6 l3">
    <h5>Second</h5>
  </div>
  <div class="s12 m6 l3">
    <h5>Third</h5>
  </div>
</div>
```

# HELPERS

## Alignments

left-align, right-align, center-align, top-align, bottom-align, middle-align

## Blurs

blur, small-blur, medium-blur, large-blur, light, dark

## Colors

amber1, amber2, amber3, amber4, amber5, amber6, amber7, amber8, amber9, amber10, amber, amber-border, amber-text

blue1, blue2, blue3, blue4, blue5, blue6, blue7, blue8, blue9, blue10, blue, blue-border, blue-text

blue-grey1, blue-grey2, blue-grey3, blue-grey4, blue-grey5, blue-grey6, blue-grey7, blue-grey8, blue-grey9, blue-grey10, blue-grey, blue-grey-border, blue-grey-text

brown1, brown2, brown3, brown4, brown5, brown6, brown7, brown8, brown9, brown10, brown, brown-border, brown-text

cyan1, cyan2, cyan3, cyan4, cyan5, cyan6, cyan7, cyan8, cyan9, cyan10, cyan, cyan-border, cyan-text

deep-orange1, deep-orange2, deep-orange3, deep-orange4, deep-orange5, deep-orange6, deep-orange7, deep-orange8, deep-orange9, deep-orange10, deep-orange, deep-orange-border, deep-orange-text

deep-purple1, deep-purple2, deep-purple3, deep-purple4, deep-purple5, deep-purple6, deep-purple7, deep-purple8, deep-purple9, deep-purple10, deep-purple, deep-purple-border, deep-purple-text

green1, green2, green3, green4, green5, green6n, green7, green8, green9, green10, green, green-border, green-text

grey1, grey2, grey3, grey4, grey5, grey6, grey7, grey8, grey9, grey10, grey, grey-border, grey-text

indigo1, indigo2, indigo3, indigo4, indigo5, indigo6, indigo7, indigo8, indigo9, indigo10, indigo, indigo-border, indigo-text

light-blue1, light-blue2, light-blue3, light-blue4, light-blue5, light-blue6, light-blue7, light-blue8, light-blue9, light-blue10, light-blue, light-blue-border, light-blue-text

light-green1, light-green2, light-green3, light-green4, light-green5, light-green6, light-green7, light-green8, light-green9, light-green10, light-green, light-green-border, light-green-text

lime1, lime2, lime3, lime4, lime5, lime6, lime7, lime8, lime9, lime10, lime, lime-border, lime-text

orange1, orange2, orange3, orange4, orange5, orange6, orange7, orange8, orange9, orange10, orange, orange-border, orange-text

pink1, pink2, pink3, pink4, pink5, pink6, pink7, pink8, pink9, pink10, pink, pink-border, pink-text

purple1, purple2, purple3, purple4, purple5, purple6, purple7, purple8, purple9, purple10, purple, purple-border, purple-text

red1, red2, red3, red4, red5, red6, red7, red8, red9, red10, red, red-border, red-text

teal1, teal2, teal3, teal4, teal5, teal6, teal7, teal8, teal9, teal10, teal, teal-border, teal-text

yellow1, yellow2, yellow3, yellow4, yellow5, yellow6, yellow7, yellow8, yellow9, yellow10, yellow, yellow-border, yellow-text

## Directions

horizontal, vertical

## Dividers

divider, small-divider, medium-divider, large-divider

## Elevates

elevate, no-elevate, small-elevate, medium-elevate, large-elevate, 

## Forms

border, no-border, circle, square, none, fill, extend, drawer, round, no-round, small-round, medium-round, large-round, left-round, right-round, top-round, bottom-round

## Margins

margin, no-margin, auto-margin, tiny-margin, small-margin, medium-margin, large-margin, left-margin, right-margin, top-margin, bottom-margin, horizontal-margin, vertical-margin

## Opacities

opacity, no-opacity, small-opacity, medium-opacity, large-opacity

## Paddings

padding, no-padding, auto-padding, tiny-padding, small-padding, medium-padding, large-padding, left-padding, right-padding, top-padding, bottom-padding, horizontal-padding, vertical-padding

## Positions

left, right, center, top, bottom, middle, front, back

## Responsive

responsive, s, m, l

## Scrolls

scroll, no-scroll

## Shadows

shadow, left-shadow, right-shadow, top-shadow, bottom-shadow

## Sizes

tiny, small, medium, large, extra, wrap, no-wrap, max, small-width, medium-width, large-width, small-height, medium-height, large-height

## Spaces

space, no-space, small-space, medium-space, large-space

## Theme

light, dark

primary, primary-text, primary-border, primary-container

secondary, secondary-text, secondary-border, secondary-container

tertiary, tertiary-text, tertiary-border, tertiary-container

error, error-text, error-border, error-container

background, surface, surface-variant, inverse-surface

inverse-primary, inverse-primary-text, inverse-primary-border

black, black-text, black-border

white, white-text, white-border

transparent, transparent-text, transparent-border

## Triggers

active

## [Typography](#typography)

h1, h2, h3, h4, h5, h6, italic, bold, underline, overline, upper, lower, capitalize, link, small-text, medium-text, large-text 

## Waves

wave, no-wave, light, dark

# Icon

Material design system icons are simple, modern, friendly, and sometimes quirky. Each icon is created using our design guidelines to depict in simple and minimal forms the universal concepts used commonly throughout a UI. Ensuring readability and clarity at both large and small sizes, these icons have been optimized for beautiful display on all common platforms and display resolutions. Get all icons here https://fonts.google.com/icons.

## Element

```html
<i>...</i>
<i>
  <svg>...</svg>
</i>
<i>
  <img>
</i>
```

## Most used helpers

**Forms**

fill

**Sizes**

tiny, small, medium, large, extra

## Example

```html
<i>home</i>
```

## SVG example

```html
<i>
  <svg viewBox="0 0 24 24">
    <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M7.07,18.28C7.5,17.38 10.12,16.5 12,16.5C13.88,16.5 16.5,17.38 16.93,18.28C15.57,19.36 13.86,20 12,20C10.14,20 8.43,19.36 7.07,18.28M18.36,16.83C16.93,15.09 13.46,14.5 12,14.5C10.54,14.5 7.07,15.09 5.64,16.83C4.62,15.5 4,13.82 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,13.82 19.38,15.5 18.36,16.83M12,6C10.06,6 8.5,7.56 8.5,9.5C8.5,11.44 10.06,13 12,13C13.94,13 15.5,11.44 15.5,9.5C15.5,7.56 13.94,6 12,6M12,11A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 12,8A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 12,11Z"></path>
  </svg>
</i>
```

## Multiple icons in a single SVG example

```html
<svg viewBox="0 0 24 24" style="display: none">
  <g id="home">
    <path d="M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z"></path>
  </g>
  <g id="star">
    <path d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z"></path>
  </g>
  <g id="account_circle">
    <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M7.07,18.28C7.5,17.38 10.12,16.5 12,16.5C13.88,16.5 16.5,17.38 16.93,18.28C15.57,19.36 13.86,20 12,20C10.14,20 8.43,19.36 7.07,18.28M18.36,16.83C16.93,15.09 13.46,14.5 12,14.5C10.54,14.5 7.07,15.09 5.64,16.83C4.62,15.5 4,13.82 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,13.82 19.38,15.5 18.36,16.83M12,6C10.06,6 8.5,7.56 8.5,9.5C8.5,11.44 10.06,13 12,13C13.94,13 15.5,11.44 15.5,9.5C15.5,7.56 13.94,6 12,6M12,11A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 12,8A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 12,11Z"></path>
  </g>
</svg>

<i>
  <svg viewBox="0 0 24 24">
    <use href="#home"></use>
  </svg>
</i>

<i>
  <svg viewBox="0 0 24 24">
    <use href="#star"></use>
  </svg>
</i>

<i>
  <svg viewBox="0 0 24 24">
    <use href="#account_circle"></use>
  </svg>
</i>
```

## Image example

```html
<i>
  <img src="/favicon.png">
</i>
```

## Other libs example

To work as expected, you need to load the libs manually.

### [Font Awesome](https://fontawesome.com/search?m=free&o=r)

```html
<i class="fa-regular fa-clock"></i>
```

### [Pictogrammers](https://pictogrammers.com/library/mdi/)

```html
<i class="mdi mdi-clock-outline"></i>
```

# Input

Input fields let users enter and edit text.

## Element

```html
<div class="field">
  <input type="text">
</div>
```

## Most used helpers

**Forms**

label, border, round, fill, prefix, suffix

**Sizes**

small, medium, large, extra

**Triggers**

active

## Example

```html
<div class="field label border">
  <input type="text">
  <label>Label</label>
</div>
```

## Triggers

### To up/down a label

#### Method 1

Add/remove `active` class on label/input (the JS file of beer do this automatically).

```html
<div class="field label">
  <input type="text">
  <label class="active">Label</label>
</div>

<div class="field label border">
  <input type="text" class="active">
  <label class="active">Label</label>
</div>
```

#### Method 2

- Add `placehholder=" "` on input (a pure CSS solution).

```html
<div class="field label">
  <input type="text" placeholder=" ">
  <label>Label</label>
</div>
```

```html
<div class="field label border">
  <input type="text" placeholder=" ">
  <label>Label</label>
</div>
```

# Layout

Layouts are containers that you can place in any position. There are absolute and fixed elements.

## Element

```html
<...>
  <div class="absolute">...</div>
</...>

<div class="fixed">...</div>
```

## Most used helpers

**Alignments**

left-align, right-align, center-align, top-align, bottom-align, middle-align

**Positions**

left, right, top, bottom, front, back

**Sizes**

small, medium, large, responsive

## Absolute example

Absolute elements are relative to container.

```html
<article class="small">
  <div class="absolute left bottom right">
    <h5>Bottom of container</h5>
  </div>
</article>
```

## Fixed example

Fixed elements are relative to document.

```html
<div class="fixed left bottom right">
  <h5>Bottom of document</h5>
</div>
```

## Alignment example

```html
<article class="small center-align middle-align">
  <span>Aligned</span>
</article>
```

## Position example

```html
<article class="small">
  <span class="absolute center middle">Positioned</span>
</article>
```

## Header and footer examples

Headers and footers are `position: sticky` when `fixed`.

```html
<article class="small-width small-height scroll">
  <header class="fixed bold">Fixed header</header>
  <p>
    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
  </p>
  <p>
    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
  </p>
  <footer class="fixed bold">Fixed footer</footer>
</article>
```

## Top app bar example

```html
<header class="primary">
  <nav>
    <button class="circle transparent">
      <i>arrow_back</i>
    </button>
    <h5>Title large</h5>
    <div class="max"></div>
    <button class="circle transparent">
      <i>attach_file</i>
    </button>
    <button class="circle transparent">
      <i>today</i>
    </button>
    <button class="circle transparent">
      <i>more_vert</i>
    </button>
  </nav>
</header>
```

## Bottom app bar example

```html
<footer>
  <nav>
    <button class="circle transparent">
      <i>check_box</i>
    </button>
    <button class="circle transparent">
      <i>brush</i>
    </button>
    <button class="circle transparent">
      <i>mic</i>
    </button>
    <button class="circle transparent">
      <i>image</i>
    </button>
    <div class="max"></div>
    <button class="square round extend">
      <i>add</i>
    </button>
  </nav>
</header>
```

## List example

```html
<div class="row">
  <a>
    <i>warning</i>
  </a>
  <div class="max">Some text here</div>
  <a>
    <i>edit</i>
  </a>
  <a>
    <i>delete</i>
  </a>
</div>
```

## Clickable list example

```html
<a class="row wave">
  <i>home</i>
  <div>Item</div>
</div>
```

## Empty state example

```html
<div class="fill medium-height middle-align center-align">
  <div class="center-align">
    <i class="extra">mail</i>
    <h5>You have no new messages</h5>
    <p>Click the button to start a conversation</p>
    <div class="space"></div>
    <nav class="center-align">
      <button class="round">Send a message</button>
    </nav>
  </div>
</div>
```

# Main layout

The main layout is a common html structure to setup your pages.

## Compact example

```html
<nav class="bottom">
  <a>
    <i>home</i>
    <div>Home</div>
  </a>
  <a>
    <i>search</i>
    <div>Search</div>
  </a>
  <a>
    <i>share</i>
    <div>share</div>
  </a>
</nav>
<main class="responsive">
  <h3>Compact</h3>
</main>
```

## Medium example

```html
<nav class="left">
  <a>
    <i>home</i>
    <div>Home</div>
  </a>
  <a>
    <i>search</i>
    <div>Search</div>
  </a>
  <a>
    <i>share</i>
    <div>share</div>
  </a>
</nav>
<main class="responsive">
  <h3>Medium</h3>
</main>
```

## Expanded example

```html
<nav class="left drawer">
  <a>
    <i>home</i>
    <div>Home</div>
  </a>
  <a>
    <i>search</i>
    <div>Search</div>
  </a>
  <a>
    <i>share</i>
    <div>share</div>
  </a>
</nav>
<main class="responsive">
  <h3>Expanded</h3>
</main>
```

## Multi panes example

```html
<nav class="left">
  <a>
    <i>home</i>
    <div>Home</div>
  </a>
  <a>
    <i>search</i>
    <div>Search</div>
  </a>
  <a>
    <i>share</i>
    <div>share</div>
  </a>
</nav>
<main class="responsive">
  <div class="grid">
    <div class="s6">
      <h3>Pane 1</h3>
    </div>
    <div class="s6">
      <h3>Pane 2</h3>
    </div>
  </div>
</main>
```

## Custom example

```html
<nav class="left">
  <a>
    <i>home</i>
    <div>Home</div>
  </a>
  <a>
    <i>search</i>
    <div>Search</div>
  </a>
  <a>
    <i>share</i>
    <div>share</div>
  </a>
</nav>
<main class="responsive">
  <div class="grid">
    <div class="s12 m12 l6">
      <h3>Pane 1</h3>
    </div>
    <div class="s12 m12 l6">
      <h3>Pane 2</h3>
    </div>
    <div class="s12 m12 l6">
      <h3>Pane 3</h3>
    </div>
    <div class="s12 m12 l6">
      <h3>Pane 4</h3>
    </div>
  </div>
</main>
```

# Media

Media can be a image or video element.

## Element

```html
<img>

<video>...</video>
```

## Most used helpers

**Forms**

circle, round, no-round, left-round, right-round, top-round, bottom-round, responsive

**Sizes**

tiny, small, medium, large, extra

## Example

```html
<img src="/image.png" class="circle extra">

<video class="circle extra">
  <source src="/video.mp4" type="video/mp4">
</video>

<svg class="circle extra" viewBox="0 0 24 24">
  <path d="M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z"></path>
</svg>
```

## Responsive media example

The responsive media is a image/video that automatically adjust with the width/height of your container.

```html
<img src="/image.png" class="responsive">

<video class="responsive">
  <source src="/video.mp4" type="video/mp4">
</video>

<svg class="responsive" viewBox="0 0 24 24">
  <path d="M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z"></path>
</svg>
```

# Menu

Menus display a list of choices on temporary surfaces.

## Element

```html
<...>
  <menu>...</menu>
</...>
```

## Most used helpers

**Positions**

left, right

**Sizes**

wrap, no-wrap, min, max

**Triggers**

active

## Example

```html
<button>
  <span>Button</span>
  <menu class="no-wrap">
    <a>Item</a>
    <a>Item</a>
    <a>Item</a>
  </menu>
</button>
```

## Triggers 

#### To open/close a menu

#### Method 1

Add/remove `active` class on menu.

```html
<button>
  <span>Button</span>
  <menu class="no-wrap active">
    <a>Item</a>
    <a>Item</a>
    <a>Item</a>
  </menu>
</button>
```

#### Method 2

Add `data-ui="menu-selector"` attribute on elements.

```html
<button data-ui="#menu">
  <span>Button</span>
  <menu id="menu" class="no-wrap">
    <a>Item</a>
    <a>Item</a>
    <a>Item</a>
  </menu>
</button>
```

#### Method 3

Call `ui("menu-selector")`.

```html
<button>
  <span>Button</span>
  <menu id="menu" class="no-wrap">
    <a>Item</a>
    <a>Item</a>
    <a>Item</a>
  </menu>
</button>
```

```js
ui('#menu');
```

# Navigation

Navigations are containers that display actions placed horizontally (or vertically). Elements, like buttons, chips, images, checkboxes, radios and switches can be placed inside a nav. Some examples are navigation rail or navigation bar.

## Element

```html
<div class="row">...</div>
<nav>...</nav>
<nav class="left">...</nav>
<nav class="right">...</nav>
<nav class="top">...</nav>
<nav class="bottom">...</nav>
```

## Most used helpers

**Alignments**

left-align, right-align, center-align, top-align, bottom-align, middle-align

**Colors**

fill, primary-container, secondary-container, tertiary-container

**Forms**

border, round, no-round, left-round, right-round, top-round, bottom-round, drawer

**Margins**

margin, no-margin, tiny-margin, small-margin, medium-margin, large-margin

**Positions**

left, right, top, bottom

**Elevates**

elevate, no-elevate, small-elevate, medium-elevate, large-elevate

**Sizes**

no-space, small-space, medium-space, large-space, wrap, no-wrap

## Row example

```html
<nav class="row">
  <div>min</div>
  <div>min</div>
  <div class="max">max</div>
</nav>
```

## Navigation example

```html
<nav>
  <button>Button</button>
  <a class="chip">Chip</button>
  <a>
    <img class="circle" src="/image.png" />
  </a>
  <label class="checkbox">
    <input type="checkbox">
  </label>
</nav>
```

## Navigation rail example

```html
<nav class="left">
  <a>
    <i>home</i>
    <div>Home</div>
  </a>
  <a>
    <i>search</i>
    <div>Search</div>
  </a>
  <a>
    <i>more_vert</i>
    <div>More</div>
  </a>
</nav>
```

## Navigation bar example

```html
<nav class="bottom">
  <a>
    <i>home</i>
    <div>Home</div>
  </a>
  <a>
    <i>search</i>
    <div>Search</div>
  </a>
  <a>
    <i>more_vert</i>
    <div>More</div>
  </a>
</nav>
```

## Navigation drawer example

```html
<nav class="drawer">
  <a>
    <i>home</i>
    <div>Home</div>
  </a>
  <a>
    <i>search</i>
    <div>Search</div>
  </a>
  <a>
    <i>more_vert</i>
    <div>More</div>
  </a>
</nav>
```

# Overlay

Overlays block user screen and can express an unspecified wait time.

## Element

```html
<div class="overlay">...</div>
```

## Most used helpers

**Alignments**

left-align, right-align, center-align, top-align, bottom-align, middle-align

**Triggers**

active

## Example

```html
<div class="overlay center-align middle-align">
  <progress class="circle"></progress>
</div>
```

## Triggers 

#### To show/hide a overlay

#### Method 1

Add/remove `active` class on overlay.

```html
<div class="overlay center-align middle-align active">
  <progress class="circle"></progress>
</div>
```

#### Method 2

Add `data-ui="overlay-selector"` attribute on elements.

```html
<button data-ui="#overlay">Show overlay</button>

<div class="overlay center-align middle-align" id="overlay">
  <progress class="circle"></progress>
</div>
```

#### Method 3

Call `ui("overlay-selector")`.

```html
<div class="overlay center-align middle-align" id="overlay">
  <progress class="circle"></progress>
</div>
```

```js
ui('#overlay');
```

# Page

Pages are containers that can be a main page, multiple pages or just to animate an element.

## Element

```html
<div class="page">...</div>
```

## Most used helpers

**Positions**

left, right, top, bottom

**Triggers**

active

## Example

```html
<div class="page">
  <h5>Title</h5>
</div>
```

## Triggers 

#### To show/hide a page

#### Method 1

Add/remove `active` class on page.

```html
<div class="page active">
  <h5>Title</h5>
</div>
```

#### Method 2

Add `data-ui="page-selector"` attribute on elements. All other pages that are in the same level will be hidden.

```html
<a data-ui="#page1">Open page 1</a>
<a data-ui="#page2">Open page 2</a>

<div class="page" id="page1">
  <h5>Page 1</h5>
</div>

<div class="page" id="page2">
  <h5>Page 2</h5>
</div>
```

#### Method 3

Call `ui("page-selector")`. All other pages that are in the same level will be hidden.

```html
<div class="page" id="page1">
  <h5>Page 1</h5>
</div>

<div class="page" id="page2">
  <h5>Page 2</h5>
</div>
```

```js
ui('#page1');
```

# Progress

Progress display the length of a process or an unspecified wait time.

## Element

```html
<progress>...</progress>
```

## Most used helpers

**Forms**

circle

**Sizes**

small, medium, large

## Linear example (default)

```html
<progress></progress>
<progress value="0.25"></progress>
<progress value="25" max="100"></progress>
```

## Circular example

```html
<progress class="circle"></progress>
```

# Radio

Radio buttons allow users to select one option from a set.

## Element

```html
<label class="radio">
  <input type="radio">
  <span></span>
</label>
```

## Example

```html
<label class="radio">
  <input type="radio">
  <span></span>
</label>

<label class="radio">
  <input type="radio">
  <span>Click here</span>
</label>

<label class="radio icon">
  <input type="radio">
  <span>
    <i>close</i>
    <i>done</i>
  </span>
</label>

<nav>
  <label class="radio">
    <input type="radio">
    <span>Item 1</span>
  </label>
  <label class="radio">
    <input type="radio">
    <span>Item 2</span>
  </label>
  <label class="radio">
    <input type="radio">
    <span>Item 3</span>
  </label>
</nav>
```

## In field elements example

```html
<div class="field middle-align">
  <nav>
    <label class="radio">
      <input type="radio">
      <span>Item 1</span>
    </label>
    <label class="radio">
      <input type="radio">
      <span>Item 2</span>
    </label>
    <label class="radio">
      <input type="radio">
      <span>Item 3</span>
    </label>
  </nav>
</div>
```

# Select

Selects display a list of choices on temporary surfaces.

## Element

```html
<div class="field">
  <select>...</select>
</div>
```

## Most used helpers

**Forms**

label, border, round, fill, prefix, suffix

**Sizes**

small, medium, large, extra

**Triggers**

active

## Example

```html
<div class="field label border">
  <select>
    <option>Item</option>
    <option>Item</option>
    <option>Item</option>
  </select>
  <label>Label</label>
</div>
```

## Triggers

### To up/down a label

#### Method 1

Add/remove `active` class on label/select (the JS file of beer do this automatically).

```html
<div class="field label">
  <select>
    <option>Item</option>
    <option>Item</option>
    <option>Item</option>
  </select>
  <label class="active">Label</label>
</div>

<div class="field label border">
  <select class="active">
    <option>Item</option>
    <option>Item</option>
    <option>Item</option>
  </select>
  <label class="active">Label</label>
</div>
```

# SETTINGS

## Default theme

It sets the default theme to dark or light.

#### Classes

light, dark

#### Variables

--primary, --on-primary, --primary-container, --on-primary-container, --secondary, --on-secondary, --secondary-container, --on-secondary-container, --tertiary, --on-tertiary, --tertiary-container, --on-tertiary-container, --error, --on-error, --error-container, --on-error-container, --background, --on-background, --surface, --on-surface, --surface-variant, --on-surface-variant, --outline, --outline-variant, --shadow, --scrim, --inverse-surface, --inverse-on-surface, --inverse-primary, --surface-dim, --surface-bright, --surface-container-lowest, --surface-container-low, --surface-container, --surface-container-high, --surface-container-highest --active, --overlay, --elevate1, --elevate2, --elevate3, --size, --font, --font-icon, --speed1, --speed2, --speed3, --speed4

#### Example

The default theme is light. Use dark to change the default theme to dark.

```html
<body>...</body>

<body class="light">...</body>

<body class="dark">...</body>
```

## Dynamic theme

It sets the theme and mode at runtime. You need to use [material-dynamic-colors](https://www.npmjs.com/package/material-dynamic-colors). You can get a real example of dynamic theme [in this codepen](https://codepen.io/leo-bnu/pen/LYWxjVG).

#### To change theme

Call `ui("theme", "color|path|url|file|blob|theme")`. It returns the new theme and applies on body element.

```js
// From color
let theme = await ui("theme", "#ffd700");

// From path
let theme = await ui("theme", "/image.png");

// From url (caution with cors error)
let theme = await ui("theme", "http://domain.com/image.png");

// From file
let file = document.query("input[type='file']").files[0];
let theme = await ui("theme", file);

// From blob
let blob = new Blob();
let theme = await ui("theme", blob);

// From theme
let theme = await ui("theme", theme);

// Get current theme
let theme = await ui("theme");

// The returned theme is
{
  dark: "--primary:#cfbcff;--on-primary:#381e72;--primary-container:#4f378a;--on-primary-container:#e9ddff;--secondary:#cbc2db;--on-secondary:#332d41;--secondary-container:#4a4458;--on-secondary-container:#e8def8;--tertiary:#efb8c8;--on-tertiary:#4a2532;--tertiary-container:#633b48;--on-tertiary-container:#ffd9e3;--error:#ffb4ab;--on-error:#690005;--error-container:#93000a;--on-error-container:#ffb4ab;--background:#1c1b1e;--on-background:#e6e1e6;--surface:#141316;--on-surface:#e6e1e6;--surface-variant:#49454e;--on-surface-variant:#cac4cf;--outline:#948f99;--outline-variant:#49454e;--shadow:#000000;--scrim:#000000;--inverse-surface:#e6e1e6;--inverse-on-surface:#313033;--inverse-primary:#6750a4;--surface-dim:#141316;--surface-bright:#3a383c;--surface-container-lowest:#0f0e11;--surface-container-low:#1c1b1e;--surface-container:#201f22;--surface-container-high:#2b292d;--surface-container-highest:#363438;",
  light: "--primary:#6750a4;--on-primary:#ffffff;--primary-container:#e9ddff;--on-primary-container:#22005d;--secondary:#625b71;--on-secondary:#ffffff;--secondary-container:#e8def8;--on-secondary-container:#1e192b;--tertiary:#7e5260;--on-tertiary:#ffffff;--tertiary-container:#ffd9e3;--on-tertiary-container:#31101d;--error:#ba1a1a;--on-error:#ffffff;--error-container:#ffdad6;--on-error-container:#410002;--background:#fffbff;--on-background:#1c1b1e;--surface:#fdf8fd;--on-surface:#1c1b1e;--surface-variant:#e7e0eb;--on-surface-variant:#49454e;--outline:#7a757f;--outline-variant:#cac4cf;--shadow:#000000;--scrim:#000000;--inverse-surface:#313033;--inverse-on-surface:#f4eff4;--inverse-primary:#cfbcff;--surface-dim:#ddd8dd;--surface-bright:#fdf8fd;--surface-container-lowest:#ffffff;--surface-container-low:#f7f2f7;--surface-container:#f2ecf1;--surface-container-high:#ece7eb;--surface-container-highest:#e6e1e6;"
}
```

#### To change mode

Call `ui("mode", "light|dark")` to set current theme between light and dark.

```js
// To light
let mode = ui("mode", "light");

// To dark
let mode = ui("mode", "dark");

// Get current mode
let mode = ui("mode");

// The returned mode is
"light" or "dark"
```

## Customize the default theme

To customize the default theme, you need to use the css structure below.

#### Example

```css
:root,
body.light {
  --primary: #6750a4;
  --on-primary: #ffffff;
  --primary-container: #e9ddff;
  --on-primary-container: #22005d;
  --secondary: #625b71;
  --on-secondary: #ffffff;
  --secondary-container: #e8def8;
  --on-secondary-container: #1e192b;
  --tertiary: #7e5260;
  --on-tertiary: #ffffff;
  --tertiary-container: #ffd9e3;
  --on-tertiary-container: #31101d;
  --error: #ba1a1a;
  --on-error: #ffffff;
  --error-container: #ffdad6;
  --on-error-container: #410002;
  --background: #fffbff;
  --on-background: #1c1b1e;
  --surface: #fdf8fd;
  --on-surface: #1c1b1e;
  --surface-variant: #e7e0eb;
  --on-surface-variant: #49454e;
  --outline: #7a757f;
  --outline-variant: #cac4cf;
  --shadow: #000000;
  --scrim: #000000;
  --inverse-surface: #313033;
  --inverse-on-surface: #f4eff4;
  --inverse-primary: #cfbcff;
  --surface-dim: #ddd8dd;
  --surface-bright: #fdf8fd;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #f7f2f7;
  --surface-container: #f2ecf1;
  --surface-container-high: #ece7eb;
  --surface-container-highest: #e6e1e6;
  --overlay: rgb(0 0 0 / 0.5);
  --active: rgb(0 0 0 / 0.1);
  --elevate1: 0 0.125rem 0.125rem 0 rgb(0 0 0 / 0.32);
  --elevate2: 0 0.25rem 0.5rem 0 rgb(0 0 0 / 0.4);
  --elevate3: 0 0.375rem 0.75rem 0 rgb(0 0 0 / 0.48);
}

body.dark {
  --primary: #cfbcff;
  --on-primary: #381e72;
  --primary-container: #4f378a;
  --on-primary-container: #e9ddff;
  --secondary: #cbc2db;
  --on-secondary: #332d41;
  --secondary-container: #4a4458;
  --on-secondary-container: #e8def8;
  --tertiary: #efb8c8;
  --on-tertiary: #4a2532;
  --tertiary-container: #633b48;
  --on-tertiary-container: #ffd9e3;
  --error: #ffb4ab;
  --on-error: #690005;
  --error-container: #93000a;
  --on-error-container: #ffb4ab;
  --background: #1c1b1e;
  --on-background: #e6e1e6;
  --surface: #141316;
  --on-surface: #e6e1e6;
  --surface-variant: #49454e;
  --on-surface-variant: #cac4cf;
  --outline: #948f99;
  --outline-variant: #49454e;
  --shadow: #000000;
  --scrim: #000000;
  --inverse-surface: #e6e1e6;
  --inverse-on-surface: #313033;
  --inverse-primary: #6750a4;
  --surface-dim: #141316;
  --surface-bright: #3a383c;
  --surface-container-lowest: #0f0e11;
  --surface-container-low: #1c1b1e;
  --surface-container: #201f22;
  --surface-container-high: #2b292d;
  --surface-container-highest: #363438;
  --overlay: rgb(0 0 0 / 0.5);
  --active: rgb(255 255 255 / 0.2);
  --elevate1: 0 0.125rem 0.125rem 0 rgb(0 0 0 / 0.32);
  --elevate2: 0 0.25rem 0.5rem 0 rgb(0 0 0 / 0.4);
  --elevate3: 0 0.375rem 0.75rem 0 rgb(0 0 0 / 0.48);
}
```

## Others

It sets the hover background, the overlay background, the font family order and the relative size of all elements.

#### Variables

--active, --overlay, --size

## Fonts

It sets the font and icon font of project.

#### Variables

--font, --font-icon

#### Examples

```css
 /* To import your custom font */
@import "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap";

:root {
  /* To use your custom font */
  --font: "Roboto Flex";

  /* To remove default icons */
  --font-icon: none;

  /* To use default outlined icons */
  --font-icon: "Material Symbols Outlined";

  /* To use default rounded icons */
  --font-icon: "Material Symbols Rounded";

  /* To use default sharp icons */
  --font-icon: "Material Symbols Sharp";
}
```

## Elevates

It sets the box-shadow property of elements.

#### Variables

--elevate1, --elevate2, --elevate3

## Speed

It sets the animation speed of elements.

#### Variables

--speed1, --speed2, --speed3, --speed4

# Slider

Sliders allow users to make selections from a range of values. There are two types of sliders: continuous and discrete. Default range is 0-100.

## Element

```html
<label class="slider">
  <input type="range">
  <span></span>
</label>
```

## Example

```html
<label class="slider">
  <input type="range">
  <span></span>
</label>

<label class="slider">
  <input type="range" min="4" max="8">
  <span></span>
</label>
```

## With tooltip example

```html
<label class="slider">
  <input type="range">
  <span></span>
  <div class="tooltip"></div>
</label>
```

## With icon example

```html
<nav>
  <i>sunny</i>
  <label class="slider">
    <input type="range">
    <span></span>
  </label>
  <i>rainy</i>
</nav>
```

## In field elements example

```html
<div class="field middle-align">
  <label class="slider">
    <input type="range">
    <span></span>
  </label>
</div>
```

# Snackbar

Snackbars provide brief messages about app processes at bottom or top of the screen. It's not recomended to show two or more snackbars at same time. Snackbars appear without warning, and don't require user interaction. It's recommended that they disappear from the screen after a minimum of four seconds, and a maximum of ten seconds.

## Element

```html
<div class="snackbar">...</div>
```

## Most used helpers

**Positions**

top, bottom

**Triggers**

active

## Example

```html
<div class="snackbar">
  <i>warning</i>
  <span>I'm a snackbar</span>
</div>
```

## Triggers 

#### To open/close a menu

#### Method 1

Add/remove `active` class on snackbar.

```html
<div class="snackbar active">
  <i>warning</i>
  <span>I'm a snackbar</span>
</div>
```

#### Method 2

Add `data-ui="snackbar-selector"` attribute on elements.

```html
<button data-ui="#snackbar">Open</button>

<div class="snackbar" id="snackbar">
  <i>warning</i>
  <span>I'm a snackbar</span>
</div>
```

#### Method 3

Call `ui("snackbar-selector", millisecondsToHide)`. The default value for millisecondsToHide is 6000.

```html
<div class="snackbar" id="snackbar">
  <i>warning</i>
  <span>I'm a snackbar</span>
</div>
```

```js
ui("#snackbar");
```

## Settings

**Variables** --primary, --on-primary, --primary-container, --on-primary-container, --secondary, --on-secondary, --secondary-container, --on-secondary-container, --tertiary, --on-tertiary, --tertiary-container, --on-tertiary-container, --error, --on-error, --error-container, --on-error-container, --background, --on-background, --surface, --on-surface, --surface-variant, --on-surface-variant, --outline, --outline-variant, --shadow, --scrim, --inverse-surface, --inverse-on-surface, --inverse-primary, --surface-dim, --surface-bright, --surface-container-lowest, --surface-container-low, --surface-container, --surface-container-high, --surface-container-highest, --outline, --active, --overlay, --font, --size, --elevate1, --elevate2, --elevate3, --speed1, --speed2, --speed3, --speed4

# Switch

Switches toggle the state of a single item on or off.

## Element

```html
<label class="switch">
  <input type="checkbox">
  <span></span>
</label>
```

## Example

```html
<label class="switch">
  <input type="checkbox">
  <span></span>
</label>

<nav>
  <div class="max">
    <h6>Title</h6>
    <div>Complementary text</div>
  </div>
  <label class="switch">
    <input type="checkbox">
    <span></span>
  </label>
</nav>
```

## With icons

```html
<label class="switch icon">
  <input type="checkbox">
  <span>
    <i>wifi</i>
  </span>
</label>

<label class="switch icon">
  <input type="checkbox">
  <span>
    <i>close</i>
    <i>done</i>
  </span>
</label>
```

## In field elements example

```html
<div class="field middle-align">
  <nav>
    <div class="max">
      <h6>Title</h6>
      <div>Complementary text</div>
    </div>
    <label class="switch">
      <input type="checkbox">
      <span></span>
    </label>
  </nav>
</div>
```


# Table

Tables display sets of data across rows and columns.

## Element

```html
<table>...</table>
```

## Most used helpers

**Alignments**

left-align, right-align, center-align

**Forms**

border, stripes, min, fixed

**Spaces**

no-space, space, small-space, medium-space, large-space

## Example

```html
<table>
  <thead>
    <tr>
      <th>Header</th>
      <th>Header</th>
      <th>Header</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Cell</td>
      <td>Cell</td>
      <td>Cell</td>
    </tr>
    <tr>
      <td>Cell</td>
      <td>Cell</td>
      <td>Cell</td>
    </tr>
    <tr>
      <td>Cell</td>
      <td>Cell</td>
      <td>Cell</td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <th>Footer</th>
      <th>Footer</th>
      <th>Footer</th>
    </tr>
  </tfoot>
</table>
```

## Stripes Example

```html
<table class="stripes">
  <thead>
    <tr>
      <th>Header</th>
      <th>Header</th>
      <th>Header</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Cell</td>
      <td>Cell</td>
      <td>Cell</td>
    </tr>
    <tr>
      <td>Cell</td>
      <td>Cell</td>
      <td>Cell</td>
    </tr>
    <tr>
      <td>Cell</td>
      <td>Cell</td>
      <td>Cell</td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <th>Footer</th>
      <th>Footer</th>
      <th>Footer</th>
    </tr>
  </tfoot>
</table>
```

## Border Example

```html
<table class="border">
  <thead>
    <tr>
      <th>Header</th>
      <th>Header</th>
      <th>Header</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Cell</td>
      <td>Cell</td>
      <td>Cell</td>
    </tr>
    <tr>
      <td>Cell</td>
      <td>Cell</td>
      <td>Cell</td>
    </tr>
    <tr>
      <td>Cell</td>
      <td>Cell</td>
      <td>Cell</td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <th>Footer</th>
      <th>Footer</th>
      <th>Footer</th>
    </tr>
  </tfoot>
</table>
```

## Scroll Example

```html
<div class="scroll small-height">
  <table>
    <thead class="fixed">
      <tr>
        <th>Header</th>
        <th>Header</th>
        <th>Header</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Cell</td>
        <td>Cell</td>
        <td>Cell</td>
      </tr>
      <tr>
        <td>Cell</td>
        <td>Cell</td>
        <td>Cell</td>
      </tr>
      <tr>
        <td>Cell</td>
        <td>Cell</td>
        <td>Cell</td>
      </tr>
      <tr>
        <td>Cell</td>
        <td>Cell</td>
        <td>Cell</td>
      </tr>
      <tr>
        <td>Cell</td>
        <td>Cell</td>
        <td>Cell</td>
      </tr>
      <tr>
        <td>Cell</td>
        <td>Cell</td>
        <td>Cell</td>
      </tr>
    </tbody>
    <tfoot class="fixed">
      <tr>
        <th>Footer</th>
        <th>Footer</th>
        <th>Footer</th>
      </tr>
    </tfoot>
  </table>
</div>
```

# Tabs

Tabs organize content across different screens, data sets, and other interactions.

## Element

```html
<div class="tabs">...</div>
```

## Most used helpers

**Alignments**

left-align, right-align, center-align

**Directions**

horizontal, vertical

**Sizes**

min, max

**Triggers**

active

## Example

```html
<div class="tabs">
  <a>Tab 1</a>
  <a>Tab 2</a>
  <a>Tab 3</a>
</div>

<div class="page">
  <h5>Tab 1</h5>
</div>
<div class="page">
  <h5>Tab 2</h5>
</div>
<div class="page">
  <h5>Tab 3</h5>
</div>
```

## Triggers 

#### To active a tab

#### Method 1

Add/remove `active` class on tab and page elements.

```html
<div class="tabs">
  <a class="active">Tab 1</a>
  <a>Tab 2</a>
  <a>Tab 3</a>
</div>

<div class="page active">
  <h5>Tab 1</h5>
</div>
<div class="page">
  <h5>Tab 2</h5>
</div>
<div class="page">
  <h5>Tab 3</h5>
</div>
```

#### Method 2

Add `data-ui="page-selector"` attribute on elements. All other pages that are in the same level will be hidden.

```html
<div class="tabs">
  <a data-ui="#page1">Tab 1</a>
  <a data-ui="#page2">Tab 2</a>
  <a data-ui="#page3">Tab 3</a>
</div>

<div class="page" id="page1">
  <h5>Tab 1</h5>
</div>
<div class="page" id="page2">
  <h5>Tab 2</h5>
</div>
<div class="page" id="page3">
  <h5>Tab 3</h5>
</div>
```

# Textarea

Textarea fields let users enter and edit long text.

## Element

```html
<div class="field textarea">
  <textarea></textarea>
</div>
```

## Most used helpers

**Forms**

label, textarea, border, round, fill, prefix, suffix

**Sizes**

small, medium, large, extra

**Triggers**

active

## Example

```html
<div class="field textarea label border">
  <textarea></textarea>
  <label>Label</label>
</div>
```

## Triggers

### To up/down a label

#### Method 1

Add/remove `active` class on label/textarea (the JS file of beer do this automatically).

```html
<div class="field label">
  <textarea></textarea>
  <label class="active">Label</label>
</div>

<div class="field label border">
  <textarea class="active"></textarea>
  <label class="active">Label</label>
</div>
```

#### Method 2

- Add `placehholder=" "` on textarea (a pure CSS solution).

```html
<div class="field label">
  <textarea placeholder=" "></textarea>
  <label>Label</label>
</div>
```

```html
<div class="field label border">
  <textarea placeholder=" "></textarea>
  <label>Label</label>
</div>
```

# Tooltip

Tooltips displays informative text when users hover over, focus on, or tap an element.

## Element

```html
<...>
  <div class="tooltip">...</div>
</...>
```

## Most used helpers

**Positions**

left, right, top, bottom

**Sizes**

max

## Example

```html
<button>
  <span>Button</span>
  <div class="tooltip">I'm a tooltip</div>
</button>
```

# Typography

Use typography to present your design and content as clearly and efficiently as possible.

## Element

```html
<h1>...</h1>
<h2>...</h2>
<h3>...</h3>
<h4>...</h4>
<h5>...</h5>
<h6>...</h6>
<b>...</b>
<p>...</p>
<span>...</span>
<div>...</div>
<...>...</...>
```

## Most used helpers

**texts**

italic, bold, underline, overline, upper, lower, capitalize, link, small-text, medium-text, large-text

**Sizes**

small, medium, large

## Display and Headline example

```html
<h1>Display</h1>
<h2>Display</h2>
<h3>Display</h3>
<h4>Headline</h4>
<h5>Headline</h5>
<h6>Headline</h6>
```

## Formatting example

```html
<a class="link">link</a>
<a class="inverse-link">inverse-link</a>
<p class="italic">italic</p>
<p class="bold">bold</p>
<p class="underline">underline</p>
<p class="overline">overline</p>
<p class="upper">upper</p>
<p class="lower">lower</p>
<p class="capitalize">capitalize</p>
<p class="small-text">small-text</p>
<p class="medium-text">medium-text</p>
<p class="large-text">large-text</p>
```

## Line spacing example

```html
<div class="no-line">...</div>
<div class="tiny-line">...</div>
<div class="small-line">...</div>
<div class="medium-line">...</div>
<div class="large-line">...</div>
<div class="extra-line">...</div>
```
