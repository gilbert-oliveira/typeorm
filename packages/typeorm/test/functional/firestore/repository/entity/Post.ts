import { AfterLoad } from "../../../../../src/decorator/listeners/AfterLoad"
import { Column } from "../../../../../src/decorator/columns/Column"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"

@Entity()
export class Post {
    @PrimaryColumn()
    id: string

    @Column()
    title: string

    @Column({ nullable: true })
    text?: string

    loaded?: boolean

    @AfterLoad()
    markLoaded() {
        this.loaded = true
    }
}
