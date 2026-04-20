#[allow(unused_const, unused_field)]
module one_portrait::unit;

use one_portrait::events;
use one_portrait::kakera;
use one_portrait::registry::{Self as registry, AdminCap, Registry};
use sui::clock::{Self as clock, Clock};
use sui::table::{Self as table, Table};

const STATUS_PENDING: u8 = 0;
const STATUS_FILLED: u8 = 1;
const STATUS_FINALIZED: u8 = 2;
const ENOT_IMPLEMENTED: u64 = 0;
const EINVALID_MAX_SLOTS: u64 = 1;
const ENEXT_UNIT_ATHLETE_MISMATCH: u64 = 2;
const EUNIT_NOT_PENDING: u64 = 3;
const EALREADY_SUBMITTED: u64 = 4;

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
    unit: &mut Unit,
    walrus_blob_id: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(unit.status == STATUS_PENDING, EUNIT_NOT_PENDING);

    let submitter = tx_context::sender(ctx);
    assert!(!table::contains(&unit.submitters, submitter), EALREADY_SUBMITTED);

    let submission_no = vector::length(&unit.submissions) + 1;
    let submitted_at_ms = clock::timestamp_ms(clock);

    table::add(&mut unit.submitters, submitter, true);
    vector::push_back(
        &mut unit.submissions,
        SubmissionRef {
            submission_no,
            submitter,
            walrus_blob_id: copy walrus_blob_id,
            submitted_at_ms,
        },
    );
    let submitted_count = vector::length(&unit.submissions);
    let filled_now = submitted_count == unit.max_slots;
    if (filled_now) {
        unit.status = STATUS_FILLED;
    };

    kakera::mint_and_transfer(
        object::id(unit),
        unit.athlete_id,
        submitter,
        copy walrus_blob_id,
        submission_no,
        submitted_at_ms,
        ctx,
    );
    events::emit_submitted(
        object::id(unit),
        unit.athlete_id,
        submitter,
        walrus_blob_id,
        submission_no,
        submitted_count,
        unit.max_slots,
    );
    if (filled_now) {
        events::emit_unit_filled(
            object::id(unit),
            unit.athlete_id,
            submitted_count,
            unit.max_slots,
        );
    };
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
public fun is_filled_for_testing(unit: &Unit): bool {
    unit.status == STATUS_FILLED
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

#[test_only]
public fun submission_ref_for_testing(unit: &Unit, index: u64): SubmissionRef {
    *vector::borrow(&unit.submissions, index)
}

#[test_only]
public fun submission_ref_submission_no_for_testing(submission: &SubmissionRef): u64 {
    submission.submission_no
}

#[test_only]
public fun submission_ref_submitter_for_testing(submission: &SubmissionRef): address {
    submission.submitter
}

#[test_only]
public fun submission_ref_walrus_blob_id_for_testing(submission: &SubmissionRef): vector<u8> {
    copy submission.walrus_blob_id
}

#[test_only]
public fun submission_ref_submitted_at_ms_for_testing(submission: &SubmissionRef): u64 {
    submission.submitted_at_ms
}

public fun finalize(
    _admin_cap: &AdminCap,
    _unit: &mut Unit,
    _mosaic_blob_id: vector<u8>,
    _ctx: &mut TxContext,
) {
    abort ENOT_IMPLEMENTED
}
