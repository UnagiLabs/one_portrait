#[allow(unused_const, unused_field)]
module one_portrait::unit;

use one_portrait::registry::{AdminCap, Registry};
use sui::table::Table;

const STATUS_PENDING: u8 = 0;
const STATUS_FILLED: u8 = 1;
const STATUS_FINALIZED: u8 = 2;
const ENOT_IMPLEMENTED: u64 = 0;

public struct Unit has key {
    id: UID,
    athlete_id: u16,
    target_walrus_blob: vector<u8>,
    max_slots: u64,
    status: u8,
    master_id: Option<ID>,
    submitters: Table<address, bool>,
    submissions: vector<SubmissionRef>,
}

public struct SubmissionRef has copy, drop, store {
    submission_no: u64,
    submitter: address,
    walrus_blob_id: vector<u8>,
    submitted_at_ms: u64,
}

public fun create_unit(
    _admin_cap: &AdminCap,
    _registry: &mut Registry,
    _athlete_id: u16,
    _target_walrus_blob: vector<u8>,
    _max_slots: u64,
    _ctx: &mut TxContext,
) {
    abort ENOT_IMPLEMENTED
}

public fun rotate_current_unit(
    _admin_cap: &AdminCap,
    _registry: &mut Registry,
    _athlete_id: u16,
    _next_unit_id: ID,
) {
    abort ENOT_IMPLEMENTED
}

public fun submit_photo(
    _unit: &mut Unit,
    _walrus_blob_id: vector<u8>,
    _ctx: &mut TxContext,
) {
    abort ENOT_IMPLEMENTED
}

public fun finalize(
    _admin_cap: &AdminCap,
    _unit: &mut Unit,
    _mosaic_blob_id: vector<u8>,
    _ctx: &mut TxContext,
) {
    abort ENOT_IMPLEMENTED
}
