"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PoolStatus = exports.Side = void 0;
var Side;
(function (Side) {
    Side[Side["Up"] = 0] = "Up";
    Side[Side["Down"] = 1] = "Down";
    Side[Side["Draw"] = 2] = "Draw";
})(Side || (exports.Side = Side = {}));
var PoolStatus;
(function (PoolStatus) {
    PoolStatus[PoolStatus["Upcoming"] = 0] = "Upcoming";
    PoolStatus[PoolStatus["Joining"] = 1] = "Joining";
    PoolStatus[PoolStatus["Active"] = 2] = "Active";
    PoolStatus[PoolStatus["Resolved"] = 3] = "Resolved";
})(PoolStatus || (exports.PoolStatus = PoolStatus = {}));
