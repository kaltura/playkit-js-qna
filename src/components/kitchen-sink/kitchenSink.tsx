import { h, Component } from "preact";
import * as styles from "./kitchenSink.scss";

export interface KitchenSinkProps {
    onClose: () => void;
    test?: string;
}

interface KitchenSinkState {}

export class KitchenSink extends Component<KitchenSinkProps, KitchenSinkState> {
    static defaultProps = {
        test: "yeaa"
    };

    state = {};

    render(props: KitchenSinkProps) {
        const { onClose } = props;
        return (
            <div className={styles.root}>
                {/* header */}
                <div className={styles.headerContainer}>
                    <div className={styles.header}>
                        <div className={styles.title}>Notifications</div>
                        <button className={styles.closeButton} onClick={onClose} />
                    </div>
                </div>

                {/* body */}
                <div className={styles.main}>
                    <div className={styles.veryLongList} />
                </div>

                {/* footer */}
                <div className={styles.footer} />
            </div>
        );
    }
}
