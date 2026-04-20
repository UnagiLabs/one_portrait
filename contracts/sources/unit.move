#[allow(unused_const, unused_field)]
module one_portrait::unit;

use one_portrait::registry::{Self as registry, AdminCap, Registry};
use sui::table::{Self as table, Table};

const STATUS_PENDING: u8 = 0;
const STATUS_FILLED: u8 = 1;
const STATUS_FINALIZED: u8 = 2;
const ENOT_IMPLEMENTED: u64 = 0;
const EINVALID_MAX_SLOTS: u64 = 1;
const ENEXT_UNIT_ATHLETE_MISMATCH: u64 = 2;

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
    registry: &mut Registry,
    athlete_id: u16,
    target_walrus_blob: vector<u8>,
    max_slots: u64,
    ctx: &mut TxContext,
): ID {
    assert!(max_slots > 0, EINVALID_MAX_SLOTS);

    let unit = Unit {
        id: object::new(ctx),
        athlete_id,
        target_walrus_blob,
        max_slots,
        status: STATUS_PENDING,
        master_id: option::none(),
        submitters: table::new(ctx),
        submissions: vector[],
    };
    let unit_id = object::id(&unit);

    registry::set_current_unit_if_missing(registry, athlete_id, unit_id);
    transfer::share_object(unit);
    unit_id
}

public fun rotate_current_unit(
    _admin_cap: &AdminCap,
    registry: &mut Registry,
    athlete_id: u16,
    next_unit: &Unit,
) {
    assert!(next_unit.athlete_id == athlete_id, ENEXT_UNIT_ATHLETE_MISMATCH);
    registry::set_current_unit(registry, athlete_id, object::id(next_unit));
}

public fun submit_photo(
    _unit: &mut Unit,
    _walrus_blob_id: vector<u8>,
    _ctx: &mut TxContext,
) {
    abort ENOT_IMPLEMENTED
}

#[test_only]
public fun athlete_id_for_testing(unit: &Unit): u16 {
    unit.athlete_id
}

#[test_only]
public fun max_slots_for_testing(unit: &Unit): u64 {
    unit.max_slots
}

#[test_only]
public fun is_pending_for_testing(unit: &Unit): bool {
    unit.status == STATUS_PENDING
}

#[test_only]
public fun has_master_for_testing(unit: &Unit): bool {
    option::is_some(&unit.master_id)
}

#[test_only]
public fun submitter_count_for_testing(unit: &Unit): u64 {
    table::length(&unit.submitters)
}

#[test_only]
public fun submission_count_for_testing(unit: &Unit): u64 {
    vector::length(&unit.submissions)
}

public fun finalize(
    _admin_cap: &AdminCap,
    _unit: &mut Unit,
    _mosaic_blob_id: vector<u8>,
    _ctx: &mut TxContext,
) {
    abort ENOT_IMPLEMENTED
}
