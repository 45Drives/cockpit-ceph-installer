import React from 'react';
// import { NextButton } from './common/nextbutton.jsx';
import '../app.scss';
import { allVars, osdsVars, monsVars, mgrsVars, hostVars, cephAnsibleSequence } from '../services/ansibleMap.js';
import { storeGroupVars, storeHostVars, runPlaybook, getPlaybookState, getEvents, getJobEvent } from '../services/apicalls.js';
import { ElapsedTime } from './common/timer.jsx';
import { buildRoles, copyToClipboard } from '../services/utils.js';

export class DeployPage extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            deployEnabled: true,
            deployBtnText: 'Deploy',
            statusMsg: '',
            deployActive: false,
            settings: {},
            roleState: {},
            status: {
                status: '',
                msg: "",
                data: {
                    ok: 0,
                    failed: 0,
                    skipped: 0,
                    role: '',
                    task: ''
                }
            }
        };
        this.roleSequence = [];
        this.roleActive = null;
        this.roleSeen = [];
        this.mocked = true;
        this.playbookUUID = '';
        this.intervalHandler = 0;
        this.activeMockData = [];
        this.mockEvents = [
            {msg: "running", data: {
                role: "ceph-common",
                task: "doing pre-req stuff", last_task_num: 10,
                ok: 5, skipped: 2, failed: 0, failures: {}
            }},
            {msg: "running", data: {
                role: "ceph-mon",
                task: "fetching keys", last_task_num: 20,
                ok: 15, skipped: 10, failed: 0, failures: {}
            }},
            {msg: "running", data: {
                role: "ceph-common",
                task: "doing pre-req stuff", last_task_num: 23,
                ok: 17, skipped: 11, failed: 0, failures: {}
            }},
            {msg: "running", data: {
                role: "ceph-mgr",
                task: "fetching image", last_task_num: 30,
                ok: 20, skipped: 20, failed: 0, failures: {}
                //     'ceph-1': {msg: "bad things happened"}
                // }
            }},
            {msg: "running", data: {
                role: "ceph-validate",
                task: "doing pre-req stuff", last_task_num: 33,
                ok: 22, skipped: 21, failed: 0, failures: {}
            }},
            {msg: "running", data: {
                role: "ceph-osd",
                task: "formatting devices", last_task_num: 45,
                ok: 25, skipped: 30, failed: 0, failures: {}
                //     'ceph-1': {msg: "bad things happened"}
                // }
            }},
            {msg: "running", data: {
                role: "ceph-osd",
                task: "updating systemd", last_task_num: 80,
                ok: 30, skipped: 45, failed: 0, failures: {}
                //     'ceph-1': {msg: "bad things happened"}
                // }
            }},
            {msg: "successful", data: {
                role: "",
                task: "checking mon state", last_task_num: 99,
                ok: 35, skipped: 55, failed: 0, failures: {}
                //     'ceph-1': {msg: "bad things happened"}
                // }
            }}
        ];
        this.mockCephOutput = [
            "  cluster:",
            "    id:     1b04e377-6d86-447e-929d-c4e5880fcf02",
            "    health: HEALTH_OK",
            " ",
            "  services:",
            "    mon: 3 daemons, quorum ceph-1,ceph-2,ceph-3",
            "    mgr: ceph-1(active), standbys: ceph-2, ceph-3",
            "    osd: 0 osds: 0 up, 0 in",
            " ",
            "  data:",
            "    pools:   0 pools, 0 pgs",
            "    objects: 0  objects, 0 B",
            "    usage:   0 B used, 0 B / 0 B avail",
            "    pgs:     ",
            " "
        ];
    }

    componentWillReceiveProps(props) {
        const { settings } = this.state.settings;
        if (JSON.stringify(props.settings) != JSON.stringify(settings)) {
            this.setState({settings: props.settings});
            let allRoles = buildRoles(props.settings.hosts);
            if (allRoles.length > 0) {
                let tmpRoleState = {};
                for (let role of allRoles) {
                    tmpRoleState[role] = 'pending';
                    if (role == 'mons') { tmpRoleState['mgrs'] = 'pending' }
                }
                this.setState({roleState: tmpRoleState});
                this.roleSequence = cephAnsibleSequence(allRoles);
            }
        }
    }

    setRoleState = (eventData) => {
        let currentState = this.state.roleState;
        let changesMade = false;
        let eventRoleName;
        let shortName = eventData.data.role.replace("ceph-", '');

        if (this.roleSequence.includes(shortName)) {
            eventRoleName = shortName + "s";
        } else {
            eventRoleName = shortName;
        }
        switch (eventData.msg) {
        case "running":
            if (this.roleActive == null) {
                // first time through
                currentState['mons'] = 'active';
                this.roleActive = 'mons';
                changesMade = true;
                break;
            } else {
                if (eventRoleName != "") {
                    // console.log("current role active: " + this.roleActive + ", eventRoleName: " + eventRoleName + ", shortName: " + shortName);

                    // if the event role is not in the list AND we have seen the role-active name
                    // - set the current role to complete and move pending to the next
                    if (!this.roleSequence.includes(shortName) && this.roleSeen.includes(this.roleActive.slice(0, -1))) {
                        currentState[this.roleActive] = 'complete';
                        // FIXME: this won't work for iscsi
                        let a = this.roleActive.slice(0, -1); // remove the 's'
                        let nextRole = this.roleSequence[this.roleSequence.indexOf(a) + 1];
                        currentState[nextRole + 's'] = 'active';
                        this.roleActive = nextRole + 's';
                        changesMade = true;
                        break;
                    }

                    // if the shortname is in the sequence, but not in last seen
                    // - add it to last seen
                    if (!this.roleSeen.includes(shortName) && this.roleSequence.includes(shortName)) {
                        this.roleSeen.push(shortName);
                    }
                }
            }
            break;
        case "failed":
            currentState[this.roleActive] = 'failed'; // mark current breadcrumb as complete
            changesMade = true;
            break;
        case "successful":
            currentState[this.roleActive] = 'complete'; // mark current breadcrumb as complete
            changesMade = true;
            break;
        }

        if (changesMade) {
            this.setState({roleState: currentState});
        }
        console.log("roles seen " + this.roleSeen);
    }

    formattedOutput = (output) => {
        var cmdOutput = output.map(textLine => {
            return (<div className="code">{textLine}</div>);
        });
        return (
            <div>
                <h2>Ceph Cluster Status</h2>
                <p>&nbsp;</p>
                { cmdOutput }
            </div>
        );
    }

    fetchCephState = () => {
        console.log("querying events for " + this.playbookUUID);
        if (this.mocked) {
            // just return the mocked data output
            console.log("using mocked data");
            console.log("calling the main app modal");
            let content = this.formattedOutput(this.mockCephOutput);
            this.props.modalHandler(content);
        } else {
            console.log("fetching event data from the playbook run");
            getEvents(this.playbookUUID, this.props.svctoken)
                    .then((resp) => {
                        let response = JSON.parse(resp);
                        let foundEvent = '';
                        let evtIDs = Object.keys(response.data.events).reverse();
                        for (let evt of evtIDs) {
                            let thisEvent = response.data.events[evt];
                            if (thisEvent['event'] == 'runner_on_ok' && thisEvent['task'].startsWith('show ceph status for')) {
                                foundEvent = evt;
                                break;
                            }
                        }
                        if (foundEvent != '') {
                            getJobEvent(this.playbookUUID, foundEvent, this.props.svctoken)
                                    .then((resp) => {
                                        let response = JSON.parse(resp);
                                        let output = response.data.event_data.res.msg;
                                        let content = this.formattedOutput(output);
                                        this.props.modalHandler(content);
                                    })
                                    .catch(e => {
                                        console.error("Error fetching job event: " + e.message);
                                    });
                        } else {
                            console.log("playbook didn't have a show ceph status task");
                        }
                    })
                    .catch(e => {
                        console.error("Unable to fetch events for play " + this.playbookUUID);
                    });
        }
    }

    deployBtnHandler = () => {
        // user clicked deploy/Complete or retry button (multi-personality syndrome)
        console.log("User clicked the Deploy/Complete/Retry button");
        if (this.state.deployBtnText == 'Complete') {
            this.fetchCephState();
            return;
        }

        console.log("current app state is;");
        console.log(JSON.stringify(this.state.settings));

        this.setState({
            deployActive: true,
            deployBtnText: 'Running',
            deployEnabled: false
        });

        this.props.deployHandler(); // turns of the navigation bar
        console.log("Creating the hostvars and groupvars variables");
        let roleList = buildRoles(this.state.settings.hosts);
        console.log("Generating variables for roles " + roleList);
        var vars = allVars(this.state.settings);
        console.log("creating all.yml as " + JSON.stringify(vars));
        var chain = Promise.resolve();
        let mons, mgrs, osds;
        chain = chain.then(() => storeGroupVars('all', vars, this.props.svctoken));

        for (let roleGroup of roleList) {
            switch (roleGroup) {
            case "mons":
                console.log("adding mons + mgrs");
                mons = monsVars(this.state.settings);
                console.log("mon vars " + JSON.stringify(mons));
                chain = chain.then(() => storeGroupVars('mons', mons, this.props.svctoken));
                mgrs = mgrsVars(this.state.settings);
                console.log("mgr vars " + JSON.stringify(mgrs));
                chain = chain.then(() => storeGroupVars('mgrs', mgrs, this.props.svctoken));
                break;
            case "osds":
                console.log("adding osds");
                osds = osdsVars(this.state.settings);
                console.log("osd vars " + JSON.stringify(osds));
                chain = chain.then(() => storeGroupVars('osds', osds, this.props.svctoken));
                break;
            case "mdss":
                console.log("adding mds yml - TODO");
                break;
            case "rgws":
                console.log("ading rgws - TODO");
                break;
            case "iscsigws":
                console.log("adding iscsi - TODO");
                break;
            }
        }

        console.log("all group vars have been added");
        if (roleList.includes("osds")) {
            console.log("generating hostvars for the osd hosts");
            for (let host of this.state.settings.hosts) {
                if (host.osd) {
                    let osd_metadata = hostVars(host, this.state.settings.flashUsage);
                    chain = chain.then(() => storeHostVars(host.hostname, 'osds', osd_metadata, this.props.svctoken));
                }
            }
        }

        chain = chain.then(() => {
            console.log("hostvars and groupvars in place");
            this.startPlaybook();
        });

        chain.catch(err => {
            console.error("problem creating group vars files: " + err);
        });
    }

    startPlaybook = () => {
        console.log("Start playbook and set up timer to refresh every 2secs");

        if (this.mocked) {
            this.activeMockData = this.mockEvents.slice(0);
            this.intervalHandler = setInterval(this.getPlaybookState, 2000);
        } else {
            // Start the playbook
            let playbookName;
            let varOverrides = {};
            if (this.state.settings.installType.toUpperCase() == 'CONTAINER') {
                playbookName = 'site-container.yml';
            } else {
                playbookName = 'site.yml';
            }
            console.log("Attempting to start playbook " + playbookName);
            runPlaybook(playbookName, varOverrides, this.props.svctoken)
                    .then((resp) => {
                        let response = JSON.parse(resp);
                        if (response.status == "STARTED") {
                            this.playbookUUID = response.data.play_uuid;
                            console.log("playbook has started with UUID " + this.playbookUUID);
                            this.intervalHandler = setInterval(this.getPlaybookState, 2000);
                        }
                    })
                    .catch(e => {
                        console.log("Problem starting the playbook - unable to continue: " + e + ", " + e.message);
                    });
        }
    }

    getPlaybookState = () => {
        console.log("fetch state from the playbook run");
        if (this.mocked) {
            if (this.activeMockData.length > 0) {
                let mockData = this.activeMockData.shift();
                console.log(JSON.stringify(mockData));
                this.setState({status: mockData});
                this.setRoleState(mockData);
                // TODO: look at the data to determine progress state for the breadcrumb
            } else {
                console.log("All mocked data used up");
                clearInterval(this.intervalHandler);

                let playStatus = this.state.status.msg.toUpperCase();
                console.log("Last status is " + playStatus);
                let buttonText;
                buttonText = (playStatus == "SUCCESSFUL") ? "Complete" : "Retry";

                this.setState({
                    deployActive: false,
                    deployBtnText: buttonText,
                    deployEnabled: true
                });
            }
        } else {
            // this is a real run
            getPlaybookState(this.playbookUUID, this.props.svctoken)
                    .then((resp) => {
                        // process the response
                        let response = JSON.parse(resp);
                        this.setState({status: response});

                        let msg = response.msg.toUpperCase();
                        let buttonText;

                        switch (msg) {
                        case "FAILED":
                        case "CANCELED":
                        case "SUCCESSFUL":
                            buttonText = (msg == "SUCCESSFUL") ? "Complete" : "Retry";
                            clearInterval(this.intervalHandler);
                            this.setState({
                                deployActive: false,
                                deployBtnText: buttonText,
                                deployEnabled: true
                            });
                            break;
                        default:
                            // TODO: play is still active - let's look at the role/task to provide a progress update
                        }
                    })
                    .catch(e => {
                        console.log("Problem fetching playbook execution state from runner-service");
                    });
        }
    }

    render() {
        console.log("in deploypage render method");
        var spinner;
        // var breadcrumbs;

        if (this.state.deployActive) {
            spinner = (
                <div className="modifier deploy-summary">
                    <div className="modifier spinner spinner-lg">&nbsp;</div>
                    <RuntimeSummary />
                </div>
            );
            // breadcrumbs = (
            //     <div className="div-center">
            //         <BreadCrumbStatus roleState={this.state.roleState} />
            //     </div>
            // );
        } else {
            spinner = (<div className="modifier deploy-summary" />);
            // breadcrumbs = (<div />);
        }

        var deployBtnClass;
        switch (this.state.deployBtnText) {
        case "Failed":
        case "Retry":
            deployBtnClass = "btn btn-danger btn-lg btn-offset";
            break;
        case "Complete":
            deployBtnClass = "btn btn-success btn-lg btn-offset";
            break;
        default:
            deployBtnClass = "btn btn-primary btn-lg btn-offset";
            break;
        }
        console.log("btn class string is " + deployBtnClass);

        return (

            <div id="deploy" className={this.props.className}>

                <h3>Deploy the Cluster</h3>
                You are now ready to start the deployment process. <br />
                All the options you've chosen will be saved to disk, and the deployment engine (Ansible) invoked
                 to configure your hosts. Deployment progress will be shown below.<br />
                <div className="spacer" />
                <button className={deployBtnClass} disabled={!this.state.deployEnabled} onClick={this.deployBtnHandler}>{this.state.deployBtnText}</button>
                { spinner }
                <div className="divCenter">
                    <div className="separatorLine" />
                </div>
                {/* { breadcrumbs } */}
                <div className="div-center">
                    <BreadCrumbStatus runStatus={this.state.status.status} roleState={this.state.roleState} />
                </div>
                <ExecutionProgress active={this.state.deployActive} status={this.state.status} />
                <FailureSummary status={this.state.status} failures={this.state.status.data.failed} />
                {/* <NextButton btnText="Finish" disabled={!this.state.finished} action={this.props.action} /> */}

            </div>
        );
    }
}

export class RuntimeSummary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            now: ''
        };
    }

    componentDidMount(props) {
        let now = new Date();
        this.setState({now: now.toLocaleString().substr(11)});
    }

    componentWillUnmount(props) {
        console.log("Unmounting the RuntimeSummary component");
    }

    render() {
        return (
            <div className="modifier deploy-summary">
                <table className="skinny-table">
                    <tbody>
                        <tr>
                            <td className="aligned-right">Start time:&nbsp;</td>
                            <td>{this.state.now}</td>
                        </tr>
                        <tr>
                            <td className="aligned-right">Run time:&nbsp;</td>
                            <td><ElapsedTime /></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    }
}

export class ExecutionProgress extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
        };
    }

    render() {
        var progress;
        var status;
        var taskInfo;
        progress = (<div />);

        if (this.props.status.status != '') {
            status = this.props.status;
            console.log("rendering playbook run details");
            console.log(JSON.stringify(status));
            if (status.data.role != '') {
                taskInfo = status.data.role + " : " + status.data.task;
            } else {
                taskInfo = status.data.task;
            }
            progress = (
                <div>
                    <div style={{float: "left"}}>
                        <table className="playbook-table">
                            <tbody>
                                <tr>
                                    <td className="task-title">Completed Tasks</td>
                                    <td className="task-data aligned-right">{ status.data.ok }</td>
                                </tr>
                                <tr>
                                    <td className="task-title">Skipped</td>
                                    <td className="task-data aligned-right">{ status.data.skipped }</td>
                                </tr>
                                <tr>
                                    <td className="task-title">Task Failures</td>
                                    <td className="task-data aligned-right">{ status.data.failed }</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div className="task-title aligned-right float-left" >
                    Current Task:
                    </div>
                    <div className="float-left" >
                        { taskInfo }
                    </div>
                </div>
            );
        }
        // tried using rowSpan, but it doesn't render correctly, so switched to
        // multiple side-by-side divs
        return (
            <div>
                { progress }
            </div>
        );
    }
}

export class FailureSummary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
        };
    }

    render() {
        var failureRows;
        var failureSection;

        failureSection = (
            <div />
        );

        if (this.props.failures > 0) {
            let failedHosts = Object.keys(this.props.status.data.failures);
            failureRows = failedHosts.map((host, id, ary) => {
                let hostError = this.props.status.data.failures[host]['event_data'];
                return <FailureDetail
                            key={id}
                            hostname={host}
                            errorEvent={hostError} />;
            });

            failureSection = (
                <table className="failure-table">
                    <tbody>
                        <tr>
                            <th className="fhost">Hostname</th>
                            <th className="fdetail">Task Name / Failure Reason</th>
                            <th className="fbtn">&nbsp;</th>
                        </tr>
                        { failureRows }
                    </tbody>
                </table>
            );
        }

        return (
            <div id="failures">
                { failureSection }
            </div>
        );
    }
}

export class FailureDetail extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
        };
    }

    clipboardCopy = () => {
        console.log("copying error for " + this.props.hostname + " to the clipboard");
        let errorText;
        errorText = this.props.hostname + " failed in role '";
        errorText += this.props.errorEvent['role'] + "', task '";
        errorText += this.props.errorEvent['task'] + "'. Error msg - ";
        errorText += this.props.errorEvent['res']['msg'];
        copyToClipboard(errorText);
    }

    render() {
        return (
            <tr>
                <td className="fhost">{this.props.hostname}</td>
                <td className="fdetail">
                    [{this.props.errorEvent['role']}] {this.props.errorEvent['task']}<br />
                    {this.props.errorEvent['res']['msg']}
                </td>
                <td className="fbtn">
                    <button className="pficon-export" onClick={this.clipboardCopy} />
                </td>
            </tr>
        );
    }
}

export class BreadCrumbStatus extends React.Component {
    render () {
        var breadcrumbs;
        if (this.props.runStatus != '') {
            var roles = Object.keys(this.props.roleState);
            breadcrumbs = roles.map(role => {
                return <Breadcrumb
                            key={role}
                            label={role}
                            state={this.props.roleState[role]} />;
            });
        } else {
            breadcrumbs = (<div />);
        }
        return (
            <div className="display-inline-block">
                { breadcrumbs }
            </div>
        );
    }
}

export class Breadcrumb extends React.Component {
    render() {
        console.log("rendering a breadcrumb");
        var status;
        switch (this.props.state) {
        case "pending":
            status = "grey";
            break;
        case "active":
            status = "blue";
            break;
        case "complete":
            status = "green";
            break;
        case "failed":
            status = "red";
            break;
        }

        status += " breadcrumb";
        return (
            <div className={status}>{this.props.label}</div>
        );
    }
}

export default DeployPage;
