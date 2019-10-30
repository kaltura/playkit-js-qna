import { h, Component } from "preact";
import * as styles from "./menuIcon.scss";

export interface MenuIconProps {
    showIndication: boolean;
}

export class MenuIcon extends Component<MenuIconProps> {
    static defaultProps = {
        showIndication: false
    };

    render() {
        return (
            <div className={styles.icon}>
                {this.props.showIndication && <span className={styles.indicator} />}
            </div>
        );
    }
}
