import React from 'react';
import '../../app.scss';
import { Tooltip } from './tooltip.jsx';

export class Selector extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
        };
    }

    selectorChanged = (event) => {
        console.log("selector changed: " + event.target.value);
        this.props.callback(event);
    }

    render() {
        console.log("rendering selector");
        let divStyle;
        let labelStyle;
        let toolTip;
        if (this.props.tooltip) {
            toolTip = (<Tooltip text={ this.props.tooltip } />);
        } else {
            toolTip = (
                <span />
            );
        }
        if (this.props.horizontal) {
            divStyle = "display-inline-block sel-container-horizontal";
            labelStyle = "display-block sel-label-horizontal bold-text";
        }
        if (this.props.vertical) {
            divStyle = "display-block sel-container-vertical";
            labelStyle = "display-inline-block sel-label-vertical bold-text";
        }
        if (this.props.noformat) {
            divStyle = "display-block";
            labelStyle = "display-inline-block";
        }
        var options = this.props.options.map(function(opt, item) {
            return <option key={ item } value={ opt }>{ opt }</option>;
        });
        return (
            <div className={divStyle}>
                <div className={labelStyle}><b>{ this.props.labelName }</b>{ toolTip }</div>
                <select className="dropdown-box" value={this.props.value} onChange={this.selectorChanged}>
                    { options }
                </select>
            </div>
        );
    }
}
