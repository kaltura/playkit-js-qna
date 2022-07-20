# PlayKit JS QnA - plugin for the [PlayKit JS Player]

PlayKit JS QnA is written in [ECMAScript6], statically analysed using [Typescript] and transpiled in ECMAScript5 using [Babel].

[typescript]: https://www.typescriptlang.org/
[ecmascript6]: https://github.com/ericdouglas/ES6-Learning#articles--tutorials
[babel]: https://babeljs.io

## Getting Started

### Prerequisites

The plugin requires [Kaltura Player] to be loaded first.

[kaltura player]: https://github.com/kaltura/kaltura-player-js

### Installing

First, clone and run [yarn] to install dependencies:

[yarn]: https://yarnpkg.com/lang/en/

```
git clone https://github.com/kaltura/playkit-js-qna.git
cd playkit-js-qna
yarn install
```

### Building

Then, build the player

```javascript
yarn run build
```

### Embed the library in your test page

Finally, add the bundle as a script tag in your page, and initialize the player

```html
<script type="text/javascript" src="/PATH/TO/FILE/kaltura-player.js"></script>
<!--Kaltura player-->
<script type="text/javascript" src="/PATH/TO/FILE/playkit-qna.js"></script>
<!--PlayKit qna plugin-->
<div id="player-placeholder" style="height:360px; width:640px">
  <script type="text/javascript">
    var playerContainer = document.querySelector("#player-placeholder");
    var config = {
     ...
     targetId: 'player-placeholder',
     plugins: {
       qna: { ... }
     }
     ...
    };
    var player = KalturaPlayer.setup(config);
    player.loadMedia(...);
  </script>
</div>
```

## Documentation

QnA plugin configuration can been found here:

- **[Configuration](docs/configuration.md)**

### And coding style tests

We use ESLint [recommended set](http://eslint.org/docs/rules/) with some additions for enforcing [Flow] types and other rules.

See [ESLint config](.eslintrc.json) for full configuration.

We also use [.editorconfig](.editorconfig) to maintain consistent coding styles and settings, please make sure you comply with the styling.


## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/kaltura/playkit-js-qna/tags).

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE.md](LICENSE.md) file for details

## Commands

Run dev server: `npm run serve`;<br/>
Update contrib: `npm run infra:latest`;<br/>
Bump version: `npm run deploy:prepare`;<br/>

## Configuration

Plugin configuration:<br/>
> bannerDuration: number;<br/>
> toastDuration: number;<br/>
> dateFormat: string;<br/>
> expandMode: string;<br/>
> expandOnFirstPlay: boolean;<br/>