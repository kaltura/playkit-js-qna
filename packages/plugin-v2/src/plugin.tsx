import { h, render } from "preact";
import Stage, { Props as StageProps } from "@plugin/shared/components/Stage";
import { log, enableLogIfNeeded } from "@playkit-js/playkit-js-ovp";

const isDev = true; // TODO - should be provided by Omri Katz as part of the cli implementation
const pluginName = `qna${isDev ? "-local" : ""}`;

(function(mw, $) {
    enableLogIfNeeded(pluginName);

    function isIpad() {
        return navigator.userAgent.indexOf("iPad") != -1;
    }

    function isIphone() {
        return navigator.userAgent.indexOf("iPhone") != -1 && !isIpad();
    }

    mw.kalturaPluginWrapper(function() {
        mw.PluginManager.add(
            pluginName,
            mw.KBaseComponent.extend({
                _root: null,
                _wasPlayed: false,
                stage: null,
                defaultConfig: {
                    parent: "videoHolder",
                    order: 1
                },

                setup: function() {
                    if (isIphone()) {
                        log("log", "plugin::setup", "iphone detected, disable plugin");
                        return;
                    }

                    this.addBindings();
                },

                renderRoot: function(shouldHandleResize: boolean) {
                    const props: StageProps = {
                        currentTime: this._getCurrentTime()
                    };

                    const parentElement = this.getComponent()[0];

                    if (!this._root) {
                        log("debug", "plugin::renderStage", "create root component", {
                            parentElement,
                            root: this._root
                        });
                    }

                    this._root = render(
                        <Stage {...props} ref={(ref: any) => (this.stage = ref)} />,
                        parentElement,
                        this._root
                    );
                },

                addBindings: function() {
                    this.bind("updateLayout", () => {
                        log("debug", "plugin::bind(updateLayout)", "invoked");
                        this.renderRoot(true);
                    });

                    this.bind("firstPlay", () => {
                        log("debug", "plugin::bind(firstPlay)", "invoked");

                        if (!this._wasPlayed) {
                            this.renderRoot(false);
                            this._wasPlayed = true;
                        }
                    });

                    this.bind("seeked", () => {
                        log("debug", "plugin::bind(seeked)", "invoked");

                        if (!this._wasPlayed) {
                            this.renderRoot(false);
                            this._wasPlayed = true;
                        }
                    });

                    this.bind("onChangeMedia", () => {
                        log("debug", "plugin::bind(onChangeMedia)", "invoked");

                        // DEVELOPER NOTICE: this is the destruction place.
                        this._wasPlayed = false;
                        this._videoSize = null;
                        this._qna = [];

                        const parentElement = jQuery('[id="qnaOverlay"]')[0];

                        render(
                            // @ts-ignore
                            h(null),
                            parentElement,
                            this._root
                        );

                        this._root = null;
                        this.stage = null;
                    });

                    this.bind("monitorEvent", () => {
                        this.renderRoot(false);
                    });

                    this.bind("mediaLoaded", () => {});

                    this.bind("seeked", () => {
                        this.renderRoot(false);
                    });
                },

                _getCurrentTime() {
                    return this.getPlayer().currentTime * 1000;
                },

                getComponent: function() {
                    if (!this.$el) {
                        this.$el = jQuery("<div></div>")
                            .attr("id", "qnaOverlay")
                            .css({
                                position: "absolute",
                                height: "100%",
                                width: "100%",
                                top: 0,
                                left: 0,
                                overflow: "visible"
                            });
                    }

                    return this.$el;
                }
            })
        );
    });
})((window as any).mw, (window as any).jQuery);
