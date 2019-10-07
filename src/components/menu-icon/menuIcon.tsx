import { h, Component } from "preact";
import * as styles from "./menuIcon.scss";

export interface MenuIconState {
    showIndicator: boolean;
}

export interface MenuIconProps {}

export class MenuIcon extends Component<MenuIconProps, MenuIconState> {
    static defaultProps = {};

    state = {
        showIndicator: false
    };

    update(indicatorState: boolean): void {
        this.setState({ showIndicator: indicatorState });
    }

    private _removeIndicator = (): void => {
        this.update(false);
    };

    render() {
        return (
            <div className={styles.icon} onClick={this._removeIndicator}>
                {this.state.showIndicator && <span className={styles.indicator} />}
            </div>
        );
    }
}
