module one_portrait::accessors;

use one_portrait::master_portrait::{Self as master_portrait, MasterPortrait, Placement};
use one_portrait::registry::{Self as registry, Registry};
use one_portrait::unit::{Self as unit, SubmissionRef, Unit};
use sui::clock::Clock;

public fun submit_photo(
    unit: &mut Unit,
    walrus_blob_id: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    unit::submit_photo(unit, walrus_blob_id, clock, ctx);
}

public fun current_unit_id(registry_obj: &Registry, athlete_id: u16): Option<ID> {
    registry::current_unit_id(registry_obj, athlete_id)
}

public fun unit_athlete_id(unit_obj: &Unit): u16 {
    unit::athlete_id(unit_obj)
}

public fun unit_target_walrus_blob(unit_obj: &Unit): vector<u8> {
    unit::target_walrus_blob(unit_obj)
}

public fun unit_max_slots(unit_obj: &Unit): u64 {
    unit::max_slots(unit_obj)
}

public fun unit_status(unit_obj: &Unit): u8 {
    unit::status(unit_obj)
}

public fun unit_master_id(unit_obj: &Unit): Option<ID> {
    unit::master_id(unit_obj)
}

public fun unit_submission_count(unit_obj: &Unit): u64 {
    unit::submission_count(unit_obj)
}

public fun unit_submission_ref(unit_obj: &Unit, index: u64): SubmissionRef {
    unit::submission_ref(unit_obj, index)
}

public fun submission_ref_submission_no(submission: &SubmissionRef): u64 {
    unit::submission_ref_submission_no(submission)
}

public fun submission_ref_submitter(submission: &SubmissionRef): address {
    unit::submission_ref_submitter(submission)
}

public fun submission_ref_walrus_blob_id(submission: &SubmissionRef): vector<u8> {
    unit::submission_ref_walrus_blob_id(submission)
}

public fun submission_ref_submitted_at_ms(submission: &SubmissionRef): u64 {
    unit::submission_ref_submitted_at_ms(submission)
}

public fun master_unit_id(master: &MasterPortrait): ID {
    master_portrait::unit_id(master)
}

public fun master_athlete_id(master: &MasterPortrait): u16 {
    master_portrait::athlete_id(master)
}

public fun master_mosaic_walrus_blob_id(master: &MasterPortrait): vector<u8> {
    master_portrait::mosaic_walrus_blob_id(master)
}

public fun master_placement(master: &MasterPortrait, blob_id: vector<u8>): Placement {
    master_portrait::placement(master, blob_id)
}

public fun placement_x(placement: &Placement): u16 {
    master_portrait::placement_x(placement)
}

public fun placement_y(placement: &Placement): u16 {
    master_portrait::placement_y(placement)
}

public fun placement_submitter(placement: &Placement): address {
    master_portrait::placement_submitter(placement)
}

public fun placement_submission_no(placement: &Placement): u64 {
    master_portrait::placement_submission_no(placement)
}
