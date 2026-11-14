import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { VersionColumn } from "../../../../../src/decorator/columns/VersionColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"

@Entity()
export class VersionPost {
    @PrimaryColumn()
    id: string

    @VersionColumn()
    version: number
}
