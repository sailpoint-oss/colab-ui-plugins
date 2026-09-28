# Identity Globe

A SailPoint Identity Security Cloud UI plugin that plots your identities on a globe.

![Identity Globe](docs/identity-globe.gif)

## What to expect

When your identities have a city attribute, you can see where they are, filter them, and even follow them to the Moon.

- Spot clusters across cities and countries.
- Filter by country, department, title, and more.
- Select a location for a count and a breakdown.
- Open matching identities in Search to explore their details.

Use the five controls to customize the view.

- **Rotate** spins the globe.
- **Arc Lines** draws random connections across the view.
- **Clouds** adds a cloud layer around Earth.
- **Day/Night** shows the sunlit and dark sides of the globe.
- **Moon** switches to a lunar view and shows identities located on the Moon.

## Prerequisites

- Node.js (matches Angular 21 requirements)
- [SailPoint CLI](https://developer.sailpoint.com/docs/tools/cli) installed and configured
- HTTPS trust for `ng serve --ssl` (needed for `npm start`)
- A city attribute

## Getting started

To try the experience with synthetic identities, follow the [`docs/SETUP.md`](docs/SETUP.md) import guide and open the plugin as an org admin.

Run these in order:

```bash
npm install                 # install dependencies
npm test                    # run unit tests
npm run build               # compile the plugin
sail ui-plugins create      # first time only; later: sail ui-plugins push-manifest
sail ui-plugins upload      # upload the build to your tenant
```

Open the plugin in Identity Security Cloud as a normal installed plugin.

## Making changes

To iterate on the plugin in your tenant without uploading a build each time:

```bash
sail ui-plugins link        # point your identity at this server
npm start                   # local HTTPS server on port 4200 (keeps running)
```

Open Identity Security Cloud with `?spPluginDev=identity-globe`. The host loads this local server inside the live tenant.

## Attribution

City coordinates and populations come from [GeoNames](https://www.geonames.org/) under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See
`public/assets/geo/ATTRIBUTION.txt`.
